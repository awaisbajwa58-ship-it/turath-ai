import { SourceFilterType, SourceCitation, ResearchMode } from '../src/types.js';
import { normalizeArabicText, QuestionIntent } from './queryAnalyzer.js';
import { turathProvider } from './providers/turathProvider.js';
import { rerankerProvider } from './rerankerService.ts';
import { CandidatePassage } from './providers/interfaces.js';

// Category mapping in Nusus
const CATEGORY_MAP: Record<SourceFilterType, string[]> = {
  all: [],
  hanafi: ['14'], // Category 14: الفقه الحنفي
  hadith: ['6', '7'], // 6: كتب السنة, 7: شروح الحديث
  tafsir: ['3', '4'], // 3: التفسير, 4: علوم القرآن
  usul: ['11', '12'], // 11: أصول الفقه, 12: علوم الفقه والقواعد الفقهية
  custom: [],
};

export async function retrieveNususPassages(
  arabicQueries: string[],
  userQuestion: string,
  filter: SourceFilterType = 'all',
  options?: {
    categoryId?: string;
    categoryIds?: string[];
    bookIds?: string[];
    authorId?: string;
    researchMode?: ResearchMode;
    isOpposingRequested?: boolean;
    intentObj?: QuestionIntent;
  }
): Promise<{
  passages: SourceCitation[];
  queriesUsed: string[];
  rawHitsCount: number;
  rejectedSources: Array<{ book: string; reason: string }>;
  evidenceCounts: Record<string, number>;
}> {
  const queriesUsed: string[] = [];
  const rawCandidatePassages: CandidatePassage[] = [];
  const rejectedSources: Array<{ book: string; reason: string }> = [];

  const selectedCategoryId = options?.categoryId;
  const selectedCategoryIds = options?.categoryIds;
  const selectedBookIds = options?.bookIds && options.bookIds.length > 0 ? options.bookIds : undefined;
  const selectedAuthorId = options?.authorId;
  const isOpposingRequested = options?.isOpposingRequested || false;
  const isHanafiRestricted = filter === 'hanafi' || selectedCategoryId === '14' || (selectedCategoryIds && selectedCategoryIds.includes('14'));

  // Determine active category IDs
  const activeCategoryIds: string[] = [];
  if (selectedCategoryIds && selectedCategoryIds.length > 0) {
    activeCategoryIds.push(...selectedCategoryIds);
  } else if (selectedCategoryId) {
    activeCategoryIds.push(selectedCategoryId);
  } else if (CATEGORY_MAP[filter] && CATEGORY_MAP[filter].length > 0) {
    activeCategoryIds.push(...CATEGORY_MAP[filter]);
  }

  // Deduplication tracker map
  const candidateKeysSeen = new Set<string>();

  // Helper function to push to raw candidate list with deduplication
  const addCandidate = (p: any) => {
    if (!p || !p.text) return;
    const bookId = String(p.book?.id || '0');
    const internalPage = p.location?.internalPage || p.location?.printedPage || 1;
    const key = `${bookId}_${internalPage}`;

    if (candidateKeysSeen.has(key)) return;
    candidateKeysSeen.add(key);

    const bookTitle = p.book?.title || 'كتاب غير مسمى';
    const authorName = p.author?.name || 'مصنف غير معروف';
    const catId = p.category?.id ? String(p.category.id) : undefined;
    const printedPage = p.location?.printedPage;
    const vol = p.location?.volume;

    const volStr = vol ? `ج ${vol}، ` : '';
    const pageStr = printedPage ? `ص ${printedPage} (صفحة تراث ${internalPage})` : `صفحة تراث ${internalPage}`;
    const locator = `${volStr}${pageStr}`;

    const citationObj: SourceCitation = {
      book_id: p.book?.id || 0,
      book: bookTitle,
      author: authorName,
      locator,
      page: printedPage || internalPage,
      internalPage,
      printedPage,
      vol: vol ? String(vol) : undefined,
      arabic_text: (p.text || '').trim(),
      original_arabic_verbatim: (p.text || '').trim(),
      url: p.url || `https://app.turath.io/book/${p.book?.id}?page=${internalPage}`,
      shamela_url: p.alternateUrls?.shamela,
      headings: p.headings || [],
      citation: p.citation,
      category_id: catId,
      author_id: p.author?.id ? String(p.author.id) : undefined,
    };

    rawCandidatePassages.push({
      citation: citationObj,
      passageText: (p.text || '').trim(),
      bookTitle,
      authorName,
      categoryId: catId,
      bookId,
    });
  };

  // STEP 1: RETRIEVAL PHASE
  // If specific books are selected by user -> SEARCH STRICTLY WITHIN THOSE BOOKS ONLY
  if (selectedBookIds && selectedBookIds.length > 0) {
    // Since Turath supports only ONE book filter per search call,
    // we must query each selected book ID individually!
    // Limit to the first 16 books to maintain great performance and cover sufficient ground.
    const activeBooks = selectedBookIds.slice(0, 16);
    
    // Dynamically optimize queries per book based on how many books are selected
    let maxQueries = 2;
    if (activeBooks.length <= 2) {
      maxQueries = 4;
    } else if (activeBooks.length <= 5) {
      maxQueries = 3;
    }
    const activeQueries = arabicQueries.slice(0, maxQueries);

    const retrievalPromises: Promise<void>[] = [];
    for (const bookId of activeBooks) {
      for (const query of activeQueries) {
        if (!query.trim()) continue;
        retrievalPromises.push((async () => {
          try {
            queriesUsed.push(`${query} [book:${bookId}]`);
            const res = await turathProvider.retrieve(query.trim(), {
              scope: {
                bookIds: [Number(bookId)],
                ...(selectedAuthorId ? { authorIds: [Number(selectedAuthorId)] } : {}),
              },
              maxPassages: 8,
              maxCharsPerPassage: 3000,
            });

            if (res && res.passages) {
              for (const passage of res.passages) {
                addCandidate(passage);
              }
            }
          } catch (err: any) {
            console.warn(`[Nusus] Retrieve book:${bookId} query "${query}" failed:`, err?.message || err);
          }
        })());
      }
    }
    await Promise.all(retrievalPromises);
  } else {
    // Attempt with category filter
    if (activeCategoryIds.length > 0) {
      const categoryPromises: Promise<void>[] = [];
      const priorityQueries = arabicQueries.slice(0, 4);
      for (const catId of activeCategoryIds) {
        for (const query of priorityQueries) {
          if (!query.trim()) continue;
          categoryPromises.push((async () => {
            try {
              queriesUsed.push(`${query} [cat:${catId}]`);
              const res = await turathProvider.retrieve(query.trim(), {
                scope: {
                  categoryIds: [Number(catId)],
                  ...(selectedAuthorId ? { authorIds: [Number(selectedAuthorId)] } : {}),
                },
                maxPassages: 8,
                maxCharsPerPassage: 3000,
              });

              if (res && res.passages) {
                for (const passage of res.passages) {
                  addCandidate(passage);
                }
              }
            } catch (err: any) {
              console.warn(`[Nusus] Retrieve cat:${catId} query "${query}" failed:`, err?.message || err);
            }
          })());
        }
      }
      await Promise.all(categoryPromises);
    }

    // Attempt general queries to reach solid candidate set
    if (rawCandidatePassages.length < 15) {
      const generalPromises: Promise<void>[] = [];
      const priorityQueries = arabicQueries.slice(0, 5);
      for (const query of priorityQueries) {
        if (!query.trim()) continue;
        generalPromises.push((async () => {
          try {
            queriesUsed.push(query);
            const res = await turathProvider.retrieve(query.trim(), {
              ...(selectedAuthorId ? { scope: { authorIds: [Number(selectedAuthorId)] } } : {}),
              maxPassages: 8,
              maxCharsPerPassage: 3000,
            });

            if (res && res.passages) {
              for (const passage of res.passages) {
                addCandidate(passage);
              }
            }
          } catch (err: any) {
            console.warn(`[Nusus] Retrieve general query "${query}" failed:`, err?.message || err);
          }
        })());
      }
      await Promise.all(generalPromises);
    }
  }

  const rawHitsCount = rawCandidatePassages.length;
  if (rawHitsCount === 0) {
    return {
      passages: [],
      queriesUsed: Array.from(new Set(queriesUsed)),
      rawHitsCount: 0,
      rejectedSources: [],
      evidenceCounts: {},
    };
  }

  // STEP 2: SEMANTIC RERANKING & EVALUATION PHASE (Before context expansion to save unnecessary calls!)
  const rerankedCandidates = await rerankerProvider.rerank(
    userQuestion,
    arabicQueries,
    rawCandidatePassages,
    {
      isHanafiRestricted,
      selectedBookIds,
      selectedAuthorId,
      isOpposingRequested,
    }
  );

  // Collect rejected sources from reranking output
  for (const item of rerankedCandidates) {
    if (item.rejectionReason) {
      rejectedSources.push({
        book: item.citation.book,
        reason: item.rejectionReason,
      });
    }
  }

  // Filter out candidates rejected or below minimum relevance threshold (score < 12)
  const MIN_RELEVANCE_SCORE = 12;
  const validReranked = rerankedCandidates.filter(
    (item) => !item.rejectionReason && item.score >= MIN_RELEVANCE_SCORE
  );

  if (validReranked.length === 0) {
    return {
      passages: [],
      queriesUsed: Array.from(new Set(queriesUsed)),
      rawHitsCount,
      rejectedSources,
      evidenceCounts: {},
    };
  }

  // STEP 3: POST-RERANK CONTEXT EXPANSION (Only run on top 6 candidates to speed up search and avoid rate limits!)
  const topCandidates = validReranked.slice(0, 6);
  const contextPromises = topCandidates.map(async (item) => {
    const citation = item.citation;
    const text = citation.arabic_text || '';
    if (text.length < 250 && citation.internalPage && citation.book_id) {
      try {
        const pageData = await turathProvider.getPage(citation.book_id, citation.internalPage);
        if (pageData && pageData.text && pageData.text.length > text.length) {
          citation.arabic_text = pageData.text.trim();
          citation.original_arabic_verbatim = pageData.text.trim();
        }
      } catch (err) {
        // Silently skip if getPage context fetch fails
      }
    }
  });
  await Promise.all(contextPromises);

  // Take top 6 verified passages
  const finalPassages = topCandidates.map((item) => item.citation);

  // Tally evidence counts
  const evidenceCounts: Record<string, number> = {};
  for (const p of finalPassages) {
    const level = p.evidence_level || 'SUPPORTING';
    evidenceCounts[level] = (evidenceCounts[level] || 0) + 1;
  }

  return {
    passages: finalPassages,
    queriesUsed: Array.from(new Set(queriesUsed)),
    rawHitsCount,
    rejectedSources,
    evidenceCounts,
  };
}
