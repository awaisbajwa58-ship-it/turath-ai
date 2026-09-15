import {
  RerankerProvider,
  CandidatePassage,
  RerankedPassage,
} from './providers/interfaces.js';
import { EvidenceLevel, SourceCitation } from '../src/types.js';
import { normalizeArabicText } from './queryAnalyzer.js';
import { embeddingProvider } from './providers/embeddingProvider.js';

// Category IDs for non-Hanafi schools
const NON_HANAFI_CATEGORY_IDS = new Set(['15', '16', '17']); // 15: Maliki, 16: Shafi'i, 17: Hanbali

// Known non-Hanafi authors to guard against false attribution when Hanafi mode is active
const NON_HANAFI_AUTHOR_KEYWORDS = [
  'الهيتمي',
  'ابن حجر الهيتمي',
  'النووي',
  'الغزالي',
  'الرافعي',
  'الماوردي',
  'الجويني',
  'الشافعي',
  'الخطيب الشربيني',
  'الرملي',
  'السيوطي',
  'القرافي',
  'ابن رشد',
  'الحطاب',
  'الدردير',
  'الباجي',
  'ابن عبد البر',
  'القاضي عياض',
  'ابن قدامة',
  'البهوتي',
  'ابن تيمية',
  'ابن القيم',
  'المرداوي',
  'الخرقي',
  'ابن رجب',
  'العز بن عبد السلام',
];

// Major Hanafi books for authoritative priority
const HANAFI_KEYWORD_TITLES = [
  'رد المحتار',
  'الدر المختار',
  'الهداية',
  'المبسوط',
  'بدائع الصنائع',
  'البحر الرائق',
  'الفتاوى الهندية',
  'مجمع الأنهر',
  'فتح القدير',
  'اللباب في شرح الكتاب',
  'تنوير الأبصار',
  'کنز الدقائق',
  'الجوهرة النيرة',
  'شرح فتح القدير',
  'أصول البزدوي',
  'أصول السرخسي',
  'تأسيس النظر',
  'شرح معاني الآثار',
  'مختصر القدوري',
  'الاختيار لتعليل المختار',
  'البناية شرح الهداية',
  'الجامع الصغير',
  'الجامع الكبير',
  'الأصل',
  'حاشية ابن عابدين',
  'تبيين الحقائق',
];

export class SemanticRerankerProvider implements RerankerProvider {
  async rerank(
    userQuestion: string,
    questionConcepts: string[],
    candidates: CandidatePassage[],
    options?: {
      isHanafiRestricted?: boolean;
      selectedBookIds?: string[];
      selectedAuthorId?: string;
      isOpposingRequested?: boolean;
    }
  ): Promise<RerankedPassage[]> {
    if (!candidates || candidates.length === 0) {
      return [];
    }

    const normQuestion = normalizeArabicText(userQuestion);
    const isHanafiRestricted = Boolean(options?.isHanafiRestricted);
    const selectedBookIds = options?.selectedBookIds;
    const selectedAuthorId = options?.selectedAuthorId;
    const isOpposingRequested = Boolean(options?.isOpposingRequested);

    // Compute question embedding once
    const questionEmbedding = await embeddingProvider.getEmbedding(userQuestion);

    // Semantic Guards - Word Confusion Checks
    const isAskingAboutIjma = normQuestion.includes('اجماع') || normQuestion.includes('إجماع');
    const isAskingAboutHujjiya =
      normQuestion.includes('حجية') || normQuestion.includes('حجيت') || normQuestion.includes('حجة');
    const isAskingAboutHajj =
      normQuestion.includes('مناسك') ||
      normQuestion.split(' ').some((w) => w === 'حج' || w === 'الحج');
    const isAskingAboutMasah = normQuestion.includes('مسح');

    // Pre-calculate embeddings in parallel for candidates that pass initial checks!
    const validCandidatesForEmbedding = candidates.filter((cand) => {
      const bookTitle = cand.bookTitle || cand.citation.book || '';
      const authorName = cand.authorName || cand.citation.author || '';
      const catId = cand.categoryId || cand.citation.category_id;
      const text = cand.passageText || cand.citation.arabic_text || '';
      const normText = normalizeArabicText(text);
      const normBook = normalizeArabicText(bookTitle);
      const normAuthor = normalizeArabicText(authorName);
      const bookIdStr = String(cand.bookId || cand.citation.book_id || '');

      // 1. User Book Restriction Guard
      if (selectedBookIds && selectedBookIds.length > 0) {
        if (!selectedBookIds.includes(bookIdStr)) {
          return false;
        }
      }

      // 2. User Author Restriction Guard
      if (selectedAuthorId) {
        const candidateAuthorId = String(cand.citation.author_id || '');
        if (candidateAuthorId !== String(selectedAuthorId)) {
          return false;
        }
      }

      // 3. Strict Madhhab Guard
      if (isHanafiRestricted) {
        if (catId && NON_HANAFI_CATEGORY_IDS.has(String(catId))) {
          return false;
        }
        const isNonHanafiAuthor = NON_HANAFI_AUTHOR_KEYWORDS.some((k) =>
          normAuthor.includes(normalizeArabicText(k))
        );
        if (isNonHanafiAuthor) {
          return false;
        }
      }

      // 4. Word Confusion Guard - "Hujjiya / Usul" vs "Hajj Pilgrimage"
      if ((isAskingAboutIjma || isAskingAboutHujjiya) && !isAskingAboutHajj) {
        const lacksIjmaOrUsul =
          !normText.includes('اجماع') &&
          !normText.includes('إجماع') &&
          !normText.includes('حجية') &&
          !normText.includes('حجة') &&
          !normText.includes('اصول');

        if (
          lacksIjmaOrUsul &&
          (normText.includes('مناسك') ||
            normText.includes('طواف') ||
            normText.includes('عرفات') ||
            normText.includes('رمي الجمار'))
        ) {
          return false;
        }
      }

      // 5. Word Confusion Guard - "Masah" (wiping in wudu) vs "Messiah"
      if (isAskingAboutMasah && normText.includes('مسيح') && !normText.includes('رأس') && !normText.includes('خفين')) {
        return false;
      }

      return true;
    });

    // Calculate a fast, local lexical score for all valid candidates to select the top 10 best
    const scoredCandidates = validCandidatesForEmbedding.map((cand) => {
      const text = cand.passageText || cand.citation.arabic_text || '';
      const normText = normalizeArabicText(text);
      const bookTitle = cand.bookTitle || cand.citation.book || '';
      const normBook = normalizeArabicText(bookTitle);
      const catId = cand.categoryId || cand.citation.category_id;
      
      let localLexicalScore = 0;
      
      // Concept/keyword matching
      for (const concept of questionConcepts) {
        const normC = normalizeArabicText(concept);
        if (!normC) continue;

        if (normText.includes(normC)) {
          localLexicalScore += 30;
        } else {
          const cTokens = normC.split(' ').filter((t) => t.length > 2);
          const matched = cTokens.filter((t) => normText.includes(t));
          if (cTokens.length > 0 && matched.length === cTokens.length) {
            localLexicalScore += 20;
          } else {
            localLexicalScore += matched.length * 4;
          }
        }
      }
      
      // Hanafi authority alignment bonus
      if (isHanafiRestricted) {
        const isHanafiBook = HANAFI_KEYWORD_TITLES.some((h) =>
          normBook.includes(normalizeArabicText(h))
        );
        if (isHanafiBook || catId === '14') {
          localLexicalScore += 25;
        }
      }
      
      // Opposing evidence bonus
      if (isOpposingRequested) {
        if (
          normText.includes('ليس بحجة') ||
          normText.includes('أنكر') ||
          normText.includes('خالف') ||
          normText.includes('مناقشة')
        ) {
          localLexicalScore += 25;
        }
      }
      
      // Length bonus
      if (text.length >= 200 && text.length <= 3500) {
        localLexicalScore += 10;
      }
      
      return { cand, localLexicalScore };
    });
    
    // Sort descending by local lexical score
    scoredCandidates.sort((a, b) => b.localLexicalScore - a.localLexicalScore);

    // Limit embeddings to only the top 10 candidates to prevent API rate limits and speed up execution
    const embeddingCandidates = scoredCandidates.slice(0, 10).map(sc => sc.cand);
    const embeddingPromises = embeddingCandidates.map(async (cand) => {
      const text = cand.passageText || cand.citation.arabic_text || '';
      if (!text.trim()) return null;
      try {
        return await embeddingProvider.getEmbedding(text);
      } catch (err) {
        return null;
      }
    });

    const passageEmbeddings = await Promise.all(embeddingPromises);

    // Create a Map of candidate text to embedding
    const embeddingMap = new Map<string, number[]>();
    for (let i = 0; i < embeddingCandidates.length; i++) {
      const cand = embeddingCandidates[i];
      const text = cand.passageText || cand.citation.arabic_text || '';
      const emb = passageEmbeddings[i];
      if (emb) {
        embeddingMap.set(text, emb);
      }
    }

    const rerankedList: RerankedPassage[] = [];

    for (const cand of candidates) {
      const bookTitle = cand.bookTitle || cand.citation.book || '';
      const authorName = cand.authorName || cand.citation.author || '';
      const catId = cand.categoryId || cand.citation.category_id;
      const text = cand.passageText || cand.citation.arabic_text || '';
      const normText = normalizeArabicText(text);
      const normBook = normalizeArabicText(bookTitle);
      const normAuthor = normalizeArabicText(authorName);
      const bookIdStr = String(cand.bookId || cand.citation.book_id || '');

      // 1. User Book Restriction Guard
      if (selectedBookIds && selectedBookIds.length > 0) {
        if (!selectedBookIds.includes(bookIdStr)) {
          continue; // strictly exclude books not chosen by user
        }
      }

      // 2. User Author Restriction Guard
      if (selectedAuthorId) {
        const candidateAuthorId = String(cand.citation.author_id || '');
        if (candidateAuthorId !== String(selectedAuthorId)) {
          rerankedList.push({
            citation: cand.citation,
            score: 0,
            semanticSimilarity: 0,
            evidenceLevel: 'INSUFFICIENT',
            evidenceLabelUrdu: 'مستبعد (غیر منتخب مصنف)',
            rejectionReason: `Author ID (${candidateAuthorId}) does not match selected author ID (${selectedAuthorId})`,
          });
          continue;
        }
      }

      // 3. Strict Madhhab Guard
      if (isHanafiRestricted) {
        if (catId && NON_HANAFI_CATEGORY_IDS.has(String(catId))) {
          rerankedList.push({
            citation: cand.citation,
            score: 0,
            semanticSimilarity: 0,
            evidenceLevel: 'INSUFFICIENT',
            evidenceLabelUrdu: 'مستبعد (غیر حنفی تصنیف)',
            rejectionReason: `Non-Hanafi category (${catId}) excluded under Hanafi filter`,
          });
          continue;
        }

        const isNonHanafiAuthor = NON_HANAFI_AUTHOR_KEYWORDS.some((k) =>
          normAuthor.includes(normalizeArabicText(k))
        );
        if (isNonHanafiAuthor) {
          rerankedList.push({
            citation: cand.citation,
            score: 0,
            semanticSimilarity: 0,
            evidenceLevel: 'INSUFFICIENT',
            evidenceLabelUrdu: 'مستبعد (مؤلف غیر حنفی)',
            rejectionReason: `Non-Hanafi author (${authorName}) excluded under Hanafi filter`,
          });
          continue;
        }
      }

      // 4. Word Confusion Guard - "Hujjiya / Usul" vs "Hajj Pilgrimage"
      if ((isAskingAboutIjma || isAskingAboutHujjiya) && !isAskingAboutHajj) {
        const lacksIjmaOrUsul =
          !normText.includes('اجماع') &&
          !normText.includes('إجماع') &&
          !normText.includes('حجية') &&
          !normText.includes('حجة') &&
          !normText.includes('اصول');

        if (
          lacksIjmaOrUsul &&
          (normText.includes('مناسك') ||
            normText.includes('طواف') ||
            normText.includes('عرفات') ||
            normText.includes('رمي الجمار'))
        ) {
          rerankedList.push({
            citation: cand.citation,
            score: 0,
            semanticSimilarity: 0,
            evidenceLevel: 'INSUFFICIENT',
            evidenceLabelUrdu: 'مستبعد (عین مناسک حج)',
            rejectionReason: 'Pure Hajj pilgrimage passage rejected when user asked about Usul/Ijma',
          });
          continue;
        }
      }

      // 5. Word Confusion Guard - "Masah" (wiping in wudu) vs "Messiah"
      if (isAskingAboutMasah && normText.includes('مسيح') && !normText.includes('رأس') && !normText.includes('خفين')) {
        rerankedList.push({
          citation: cand.citation,
          score: 0,
          semanticSimilarity: 0,
          evidenceLevel: 'INSUFFICIENT',
          evidenceLabelUrdu: 'مستبعد (لفظی مغالطہ)',
          rejectionReason: "Morphological guard: 'مسح' (wiping) confused with 'مسيح' (Messiah)",
        });
        continue;
      }

      // 6. Compute Semantic & Concept Alignment Scores
      let baseScore = 0;

      // Exact phrase / Concept matches
      let directPhraseMatch = false;
      for (const concept of questionConcepts) {
        const normC = normalizeArabicText(concept);
        if (!normC) continue;

        if (normText.includes(normC)) {
          baseScore += 30;
          directPhraseMatch = true;
        } else {
          const cTokens = normC.split(' ').filter((t) => t.length > 2);
          const matched = cTokens.filter((t) => normText.includes(t));
          if (cTokens.length > 0 && matched.length === cTokens.length) {
            baseScore += 20;
          } else {
            baseScore += matched.length * 4;
          }
        }
      }

      // Vector Embedding Cosine Similarity
      let simScorePercent = 0;
      if (questionEmbedding) {
        const passageEmbedding = embeddingMap.get(text);
        if (passageEmbedding) {
          const sim = embeddingProvider.computeCosineSimilarity(
            questionEmbedding,
            passageEmbedding
          );
          simScorePercent = Math.round(sim * 100);
          baseScore += Math.round(sim * 35);
        }
      }

      // Bonus for Hanafi Authority Alignment
      if (isHanafiRestricted) {
        const isHanafiBook = HANAFI_KEYWORD_TITLES.some((h) =>
          normBook.includes(normalizeArabicText(h))
        );
        if (isHanafiBook || catId === '14') {
          baseScore += 25;
        }
      }

      // Bonus for Opposing Evidence if requested
      if (isOpposingRequested) {
        if (
          normText.includes('ليس بحجة') ||
          normText.includes('أنكر') ||
          normText.includes('خالف') ||
          normText.includes('مناقشة')
        ) {
          baseScore += 25;
        }
      }

      // Passage Length & Completeness Bonus
      if (text.length >= 200 && text.length <= 3500) {
        baseScore += 10;
      }

      // Classify evidence level based on overall reranked score
      let evidenceLevel: EvidenceLevel = 'INSUFFICIENT';
      let evidenceLabelUrdu = 'غیر کافی';

      if (directPhraseMatch || baseScore >= 45 || simScorePercent >= 65) {
        evidenceLevel = 'DIRECT';
        evidenceLabelUrdu = 'براہِ راست (صريح)';
      } else if (baseScore >= 30 || simScorePercent >= 45) {
        evidenceLevel = 'SUPPORTING';
        evidenceLabelUrdu = 'مؤید (تائيدی)';
      } else if (baseScore >= 20 || simScorePercent >= 30) {
        evidenceLevel = 'INDIRECT';
        evidenceLabelUrdu = 'بالواسطہ (ضمنی)';
      } else if (baseScore >= 12) {
        evidenceLevel = 'POSSIBLE_INFERENCE';
        evidenceLabelUrdu = 'استدلالی (احتمالی)';
      }

      const updatedCitation: SourceCitation = {
        ...cand.citation,
        score: baseScore,
        similarity_score: simScorePercent,
        evidence_level: evidenceLevel,
        evidence_label_urdu: evidenceLabelUrdu,
      };

      rerankedList.push({
        citation: updatedCitation,
        score: baseScore,
        semanticSimilarity: simScorePercent,
        evidenceLevel,
        evidenceLabelUrdu,
      });
    }

    // Sort descending by total score
    rerankedList.sort((a, b) => b.score - a.score);

    return rerankedList;
  }
}

export const rerankerProvider = new SemanticRerankerProvider();
