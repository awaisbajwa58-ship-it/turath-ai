import { SourceFilterType, ResearchResponse, DebugInfo, ResearchMode } from '../src/types.js';
import { analyzeAndGenerateQueries, normalizeArabicText } from './queryAnalyzer.js';
import { retrieveNususPassages } from './nususService.js';
import { synthesizeUrduResearchAnswer } from './aiService.js';
import { createResearchPlan } from './researchPlanner.js';
import { buildEvidenceMap } from './evidenceMapper.js';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { resolveConversationalQuery } from './conversationManager.js';

/**
 * Agentic Multi-Hop Research Loop using Gemini Native Function Calling
 */
async function executeAgenticResearchLoop(
  question: string,
  intent: any,
  filter: SourceFilterType,
  options?: {
    categoryId?: string;
    categoryIds?: string[];
    bookIds?: string[];
    authorId?: string;
  },
  plan?: any,
  apiKeyOverride?: string
): Promise<{ passages: any[]; queriesUsed: string[] }> {
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { passages: [], queriesUsed: [] };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const searchNususDeclaration: FunctionDeclaration = {
    name: 'search_nusus',
    description: 'Search the classical Islamic Turath/Shamela corpus (Nusus) for authentic Arabic passages.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'The search query in Arabic (normalized, without diacritics). Must be relevant to the sub-topics.',
        },
        search_type: {
          type: Type.STRING,
          description: 'Type of search: exact | terminology | classical_arabic | synonym | semantic | conceptual | condition | exception | opposing',
        },
        category_id: {
          type: Type.STRING,
          description: 'Optional category ID to restrict searches to specific topics or schools.',
        },
        book_ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Optional specific book IDs to restrict search to.',
        },
        author_ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Optional specific author IDs to restrict search to.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of records to return.',
        },
      },
      required: ['query'],
    },
  };

  const systemInstruction = `You are an agentic Islamic research coordinator. Your goal is to retrieve highly relevant, authentic text passages from classical Islamic Turath/Shamela to answer the user's question.
You have access to the search tool 'search_nusus'.
Rules:
1. Formulate precise search queries in Arabic.
2. If the current retrieved evidence is sufficient to answer all parts of the question, you can choose to STOP calling tools and proceed to synthesize the final answer.
3. If crucial evidence, conditions, or exceptions are missing, search again with targeted terms (like adding "بشرط" or "إلا" or synonym terms).
4. Never make up or hallucinate any texts. You must only output facts from tool results.
5. You can perform up to 3 search rounds.`;

  const contents: any[] = [
    {
      role: 'user',
      parts: [{ text: `User Question: "${question}"\nFilter context: "${filter}"` }],
    },
  ];

  let round = 0;
  const maxRounds = 2;
  const retrievedPassages: any[] = [];
  const queriesUsed: string[] = [];

  while (round < maxRounds) {
    try {
      // Evidence-based Early Stopping Evaluation: if we already have sufficient passages, stop immediately
      if (retrievedPassages.length >= 5) {
        console.log(`[Agentic Loop] Stopping early because sufficient evidence (${retrievedPassages.length} passages) retrieved.`);
        break;
      }
      if (retrievedPassages.length > 0) {
        const evidenceMap = buildEvidenceMap(retrievedPassages, question, intent, plan);
        if (evidenceMap.criticFlags.length === 0) {
          console.log(`[Agentic Loop] Stopping early because retrieved evidence is logically sufficient.`);
          break;
        }
      }

      let response;
      let modelSuccess = false;
      const agentModels = Array.from(
        new Set(
          [
            process.env.AI_MODEL,
            'gemini-3.6-flash',
            'gemini-3.5-flash',
            'gemini-3.7-flash',
            'gemini-3.1-flash-lite',
            'gemini-flash-latest',
          ]
            .filter(Boolean)
            .map((m) => (m!.startsWith('models/') ? m!.substring(7) : m!))
        )
      );

      for (const modelName of agentModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: [searchNususDeclaration] }],
            },
          });
          modelSuccess = true;
          break;
        } catch (err: any) {
          console.warn(`[Agentic Loop] Model ${modelName} failed, trying fallback:`, err?.message || err);
        }
      }

      if (!modelSuccess || !response) {
        console.error(`[Agentic Loop] All agent models failed.`);
        break;
      }

      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        break; // Stop loop if Gemini chooses not to make any more function calls
      }

      contents.push({
        role: 'model',
        parts: functionCalls.map(fc => ({
          functionCall: {
            name: fc.name,
            args: fc.args
          }
        }))
      });

      const functionResponseParts: any[] = [];
      for (const fc of functionCalls) {
        if (fc.name === 'search_nusus') {
          const args = fc.args as any;
          const query = args.query;
          const searchType = args.search_type || 'semantic';
          const queryLabel = `${query} [agentic:${searchType}]`;
          queriesUsed.push(queryLabel);

          // PRIORITIZE USER SELECTED FILTERS OVER MODEL SUGGESTED FILTERS TO PREVENT TRAPS
          const finalBookIds = options?.bookIds && options.bookIds.length > 0 ? options.bookIds : args.book_ids;
          const finalAuthorId = options?.authorId ? options.authorId : (args.author_ids && args.author_ids.length > 0 ? args.author_ids[0] : undefined);
          const finalCategoryId = options?.categoryId ? options.categoryId : args.category_id;
          const finalCategoryIds = options?.categoryIds && options.categoryIds.length > 0 ? options.categoryIds : (finalCategoryId ? [finalCategoryId] : undefined);

          // Invoke existing search pipeline wrapper
          const searchRes = await retrieveNususPassages([query], question, filter, {
            categoryId: finalCategoryId,
            categoryIds: finalCategoryIds,
            bookIds: finalBookIds,
            authorId: finalAuthorId,
          });

          for (const p of searchRes.passages) {
            retrievedPassages.push(p);
          }

          functionResponseParts.push({
            functionResponse: {
              name: 'search_nusus',
              response: {
                status: 'success',
                passages_found_count: searchRes.passages.length,
                passages: searchRes.passages.slice(0, 5).map((p) => ({
                  book: p.book,
                  author: p.author,
                  locator: p.locator,
                  text: p.arabic_text,
                  evidence_level: p.evidence_level,
                })),
              },
            },
          });
        }
      }

      contents.push({ role: 'user', parts: functionResponseParts });

      // Build intermediate evidence map to check for deficiencies and feed back to Gemini
      const midEvidence = buildEvidenceMap(retrievedPassages, question, intent, plan);
      if (midEvidence.criticFlags.length > 0) {
        contents.push({
          role: 'user',
          parts: [{
            text: `System Alert: The retrieved evidence is not yet logically sufficient.
Identified deficiencies:
${midEvidence.criticFlags.map(f => `- ${f}`).join('\n')}

Please perform another targeted query to search specifically for the missing rulings, conditions, or exceptions.`
          }]
        });
      }

      round++;
    } catch (err) {
      console.error('[Agentic Loop] error:', err);
      break;
    }
  }

  // Deduplicate retrieved passages
  const seenKeys = new Set<string>();
  const uniquePassages: any[] = [];
  for (const p of retrievedPassages) {
    const key = `${p.book_id}_${p.internalPage || p.page}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniquePassages.push(p);
    }
  }

  return { passages: uniquePassages, queriesUsed };
}

export async function executeResearchPipeline(
  userQuestion: string,
  filter: SourceFilterType = 'all',
  options?: {
    categoryId?: string;
    categoryIds?: string[];
    bookIds?: string[];
    authorId?: string;
    manualMode?: ResearchMode;
    conversationId?: string;
    history?: any[];
    apiKey?: string;
  }
): Promise<ResearchResponse> {
  let activeQuestion = userQuestion.trim();
  let isFollowUp = false;
  let activeCategoryIds = options?.categoryIds || [];
  let activeBookIds = options?.bookIds || [];

  // If we have a categoryId, add it to categoryIds
  if (options?.categoryId && !activeCategoryIds.includes(options.categoryId)) {
    activeCategoryIds = [options.categoryId, ...activeCategoryIds];
  }

  if (options?.conversationId) {
    try {
      const resolved = await resolveConversationalQuery(
        options.conversationId,
        options.history || [],
        userQuestion,
        options.apiKey
      );
      activeQuestion = resolved.resolvedQuestion.trim();
      isFollowUp = resolved.isFollowUp;
      if (resolved.categoryIds && resolved.categoryIds.length > 0) {
        activeCategoryIds = resolved.categoryIds;
      }
      if (resolved.bookIds && resolved.bookIds.length > 0) {
        activeBookIds = resolved.bookIds;
      }
      console.log(`[Conversational Resolver] Resolved: "${activeQuestion}", Follow-up: ${isFollowUp}, Active Cats: ${activeCategoryIds}, Active Books: ${activeBookIds}`);
    } catch (err: any) {
      console.warn('[Conversational Resolver] Error resolving query:', err?.message || err);
    }
  }

  const trimmedQuestion = activeQuestion;
  const manualMode = options?.manualMode || 'auto';

  // Step 1: Deep Question Analysis & Research Planning
  const plan = createResearchPlan(trimmedQuestion, filter, {
    categoryId: options?.categoryId,
    bookIds: activeBookIds,
    authorId: options?.authorId,
  });

  const {
    selectedMode,
    detectedMode,
    intent,
    generatedQueries,
    rejectedQueries,
    modelsAttempted: queryModels,
  } = await analyzeAndGenerateQueries(trimmedQuestion, filter, manualMode, options?.apiKey);

  // Inject plan subquestions/keys into intent object
  intent.structuredAnalysis = intent.structuredAnalysis || {
    topic: plan.keyConcepts[0] || 'عام',
    subject: plan.keyConcepts[0] || 'مسألة شرعية',
    action: trimmedQuestion,
    person: 'مکلف',
    condition: plan.conditionsToVerify.join('، ') || 'کوئی شرط نہیں',
    circumstance: plan.exceptionsToVerify.join('، ') || 'کوئی عذر نہیں',
    requested_ruling: 'حکم شرعی',
    requested_information: 'عبارت اور ترجمہ',
    madhhab: filter === 'hanafi' ? 'الحنفي' : 'عام',
    category: filter,
    selected_books: activeBookIds,
    selected_authors: options?.authorId ? [options.authorId] : [],
    search_intent: 'fiqh_ruling_search',
    exclusions: [],
    key_concepts: plan.keyConcepts,
    Arabic_terms: intent.keywords || [],
    synonyms: [],
  };

  const complexity = plan.complexity; // 'SIMPLE' | 'MODERATE' | 'COMPLEX'
  const researchLevel = intent.researchPlan?.research_level ?? (plan.researchDepth === 'level3' ? 3 : plan.researchDepth === 'level2' ? 2 : 1);
  console.log(`[SearchService] Orchestrator routed question. Complexity: ${complexity}, Level: ${researchLevel}`);

  // Formulate initial adaptive query set
  let adaptiveQueries: string[] = [];
  const isSimilarPhraseRequest = selectedMode === 'similar' || detectedMode === 'similar' || trimmedQuestion.includes('ملتی جلتی عبارت');
  const matchedQuoteMatch = trimmedQuestion.match(/"([^"]+)"|'([^']+)'|«([^»]+)»/);
  const matchedQuoteText = matchedQuoteMatch ? (matchedQuoteMatch[1] || matchedQuoteMatch[2] || matchedQuoteMatch[3]) : '';

  const multiStrategyQueries = intent.multiStrategyQueries || {
    exact: [],
    terminology: [],
    classicalArabic: [],
    synonyms: [],
    conceptual: [],
    reformulated: [],
    opposing: [],
  };

  if (isSimilarPhraseRequest && matchedQuoteText) {
    // Generate synonyms, terminology, and exact words for phrase search
    adaptiveQueries = [
      normalizeArabicText(matchedQuoteText),
      ...(multiStrategyQueries.exact || []),
      ...(multiStrategyQueries.terminology || []),
      ...(multiStrategyQueries.synonyms || []),
    ];
  } else if (complexity === 'SIMPLE') {
    // LEVEL 1: PRECISE SEARCH
    adaptiveQueries = [
      ...(multiStrategyQueries.exact || []),
      ...(multiStrategyQueries.terminology || []),
      ...(multiStrategyQueries.classicalArabic || [])
    ];
    if (adaptiveQueries.length === 0) {
      adaptiveQueries = [trimmedQuestion];
    }
    adaptiveQueries = adaptiveQueries.slice(0, 2); // strictly fast
  } else if (complexity === 'MODERATE') {
    // LEVEL 1 + LEVEL 2 Combined
    adaptiveQueries = [
      ...(multiStrategyQueries.exact || []),
      ...(multiStrategyQueries.terminology || []),
      ...(multiStrategyQueries.synonyms || [])
    ];
    if (adaptiveQueries.length === 0) {
      adaptiveQueries = [trimmedQuestion];
    }
    adaptiveQueries = adaptiveQueries.slice(0, 4);
  } else {
    // COMPLEX
    // STORM Perspective planning queries
    adaptiveQueries = [
      ...(multiStrategyQueries.exact || []),
      ...(multiStrategyQueries.terminology || []),
      ...(multiStrategyQueries.classicalArabic || []),
      ...(multiStrategyQueries.conceptual || []),
      ...(multiStrategyQueries.reformulated || [])
    ];
    if (adaptiveQueries.length === 0) {
      adaptiveQueries = [trimmedQuestion];
    }
    adaptiveQueries = adaptiveQueries.slice(0, 6);
  }

  // Deduplicate and filter empty
  let currentQueries = Array.from(new Set(adaptiveQueries)).map(normalizeArabicText).filter((q) => q.length > 2);
  if (currentQueries.length === 0) {
    currentQueries = [normalizeArabicText(trimmedQuestion)];
  }

  let retrievalResult: {
    passages: any[];
    queriesUsed: string[];
    rawHitsCount: number;
    rejectedSources: any[];
    evidenceCounts: Record<string, number>;
  };

  // High-Speed Adaptive Multi-Strategy Parallel Retrieval
  console.log(`[SearchService] Executing Ultra-Fast Adaptive Multi-Strategy Retrieval`);
  retrievalResult = await retrieveNususPassages(currentQueries, trimmedQuestion, filter, {
    categoryId: options?.categoryId,
    categoryIds: activeCategoryIds,
    bookIds: activeBookIds,
    authorId: options?.authorId,
    researchMode: selectedMode,
    isOpposingRequested: intent.isOpposingRequested,
    intentObj: intent,
  });

  let evidenceMap = buildEvidenceMap(retrievalResult.passages, trimmedQuestion, intent, plan);
  
  // Early exit: if 4+ authentic passages are retrieved or critic flags are clear, exit immediately
  const maxRounds = (retrievalResult.passages.length >= 4) ? 1 : (complexity === 'SIMPLE' ? 1 : 2);
  let currentRound = 1;

  while (currentRound < maxRounds) {
    if (retrievalResult.passages.length >= 4 || evidenceMap.criticFlags.length === 0) {
      console.log(`[SearchService] Stopping early at round ${currentRound} because sufficient evidence (${retrievalResult.passages.length} passages) retrieved.`);
      break;
    }

      console.log(`[SearchService] Critic flagged issues on round ${currentRound}:`, evidenceMap.criticFlags);
      const subquestions = plan.subQuestions || [];
      
      const isConditionMissing = evidenceMap.criticFlags.some(f => f.includes('MISSING_CONDITION'));
      const isExceptionMissing = evidenceMap.criticFlags.some(f => f.includes('MISSING_EXCEPTION'));
      const isInsufficientCoverage = evidenceMap.criticFlags.some(f => f.includes('INSUFFICIENT_COVERAGE'));

      const secondaryQueryPool: string[] = [];
      const mainSubjectArabic = normalizeArabicText(intent.mainSubject || '');

      // Multi-hop targeted query generation (Part 7: Evidence Reviewer generates exactly ONE targeted search)
      if (isConditionMissing) {
        // Target missing conditions specifically
        secondaryQueryPool.push(
          `${mainSubjectArabic} بشرط`,
          `${mainSubjectArabic} شروط`,
          ...(multiStrategyQueries.classicalArabic || []).slice(0, 2).map((q: string) => `${q} بشرط`),
          ...(multiStrategyQueries.conceptual || []).slice(0, 2).map((q: string) => `${q} شروط`)
        );
      }
      if (isExceptionMissing) {
        // Target missing exceptions/excuses specifically
        secondaryQueryPool.push(
          `${mainSubjectArabic} الا`,
          `${mainSubjectArabic} ضرورة`,
          `${mainSubjectArabic} عذر`,
          ...(multiStrategyQueries.classicalArabic || []).slice(0, 2).map((q: string) => `${q} الا`),
          ...(multiStrategyQueries.conceptual || []).slice(0, 2).map((q: string) => `${q} ضرورة`)
        );
      }
      if (isInsufficientCoverage && subquestions.length > 1) {
        // Find which subquestion keywords are least represented in current passages and target them
        for (const sub of subquestions) {
          const normSub = normalizeArabicText(sub);
          const isCovered = retrievalResult.passages.some(p => {
            const normP = normalizeArabicText(p.arabic_text);
            return normP.includes(normSub.substring(0, 30));
          });
          if (!isCovered) {
            console.log(`[SearchService] Targeting missing subquestion coverage: "${sub}"`);
            secondaryQueryPool.push(
              normalizeArabicText(sub),
              ...sub.split(' ').filter(w => w.length > 3).slice(0, 3)
            );
          }
        }
      }

      // Fallback queries if pool is empty
      secondaryQueryPool.push(
        ...(multiStrategyQueries.conceptual || []),
        ...(multiStrategyQueries.reformulated || []),
        ...(multiStrategyQueries.synonyms || []),
        mainSubjectArabic
      );

      const nextQueries = Array.from(new Set(secondaryQueryPool))
        .map(normalizeArabicText)
        .filter((q) => q.length > 2 && !currentQueries.includes(q))
        .slice(0, 3); // limit queries to keep it extremely fast

      if (nextQueries.length === 0) {
        console.log(`[SearchService] No more unique adaptive queries available.`);
        break;
      }

      console.log(`[SearchService] Executing adaptive Round ${currentRound + 1} with targeted queries:`, nextQueries);
      currentQueries.push(...nextQueries);

      const roundResult = await retrieveNususPassages(nextQueries, trimmedQuestion, filter, {
        categoryId: options?.categoryId,
        categoryIds: activeCategoryIds,
        bookIds: activeBookIds,
        authorId: options?.authorId,
        researchMode: selectedMode,
        isOpposingRequested: intent.isOpposingRequested,
        intentObj: intent,
      });

      // Merge and Deduplicate passages
      const passageMap = new Map<string, any>();
      for (const p of retrievalResult.passages) {
        passageMap.set(`${p.book_id}_${p.internalPage}`, p);
      }
      for (const p of roundResult.passages) {
        const key = `${p.book_id}_${p.internalPage}`;
        if (!passageMap.has(key)) {
          passageMap.set(key, p);
        }
      }

      const mergedPassages = Array.from(passageMap.values()).sort(
        (a, b) => (b.score || 0) - (a.score || 0)
      );

      retrievalResult = {
        passages: mergedPassages.slice(0, 6),
        queriesUsed: Array.from(new Set([...retrievalResult.queriesUsed, ...roundResult.queriesUsed])),
        rawHitsCount: retrievalResult.rawHitsCount + roundResult.rawHitsCount,
        rejectedSources: [...retrievalResult.rejectedSources, ...roundResult.rejectedSources],
        evidenceCounts: { ...retrievalResult.evidenceCounts },
      };

      evidenceMap = buildEvidenceMap(retrievalResult.passages, trimmedQuestion, intent, plan);
      currentRound++;
    }

  // Part 9 Phrase similarity ranking boost
  if (isSimilarPhraseRequest && matchedQuoteText) {
    const cleanQuote = normalizeArabicText(matchedQuoteText);
    retrievalResult.passages.forEach((p) => {
      const normText = normalizeArabicText(p.arabic_text);
      if (normText.includes(cleanQuote)) {
        p.score = (p.score || 0) + 50; // MASSIVE phrase match boost
      } else {
        const tokens = cleanQuote.split(' ').filter(t => t.length > 2);
        const overlap = tokens.filter(t => normText.includes(t)).length;
        p.score = (p.score || 0) + (overlap * 5);
      }
    });
    // Re-sort after boost
    retrievalResult.passages.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  // Step 3: Source-Grounded Answer Synthesis
  const { answer, modelsAttempted: answerModels } = await synthesizeUrduResearchAnswer(
    trimmedQuestion,
    retrievalResult.passages,
    {
      researchMode: selectedMode,
      isOpposingRequested: intent.isOpposingRequested,
      isComparative: intent.isComparative,
    },
    options?.apiKey
  );

  const debugInfo: DebugInfo = {
    originalQuestion: trimmedQuestion,
    selectedMode,
    detectedMode,
    detectedIntent: {
      keywords: intent.keywords,
      language: intent.language,
      targetFilter: intent.targetFilter,
      domain: intent.domain,
      mainSubject: intent.mainSubject,
      claim: intent.claim,
      isOpposingRequested: intent.isOpposingRequested,
    },
    generatedQueries: currentQueries,
    rejectedQueries,
    queriesUsed: retrievalResult.queriesUsed,
    rawHitsCount: retrievalResult.rawHitsCount,
    scoredPassagesCount: retrievalResult.passages.length,
    evidenceCounts: retrievalResult.evidenceCounts,
    selectedPassages: retrievalResult.passages.map((p) => ({
      book: p.book,
      score: p.score || 0,
      similarityScore: p.similarity_score,
      evidenceLevel: p.evidence_level,
      evidenceLabelUrdu: p.evidence_label_urdu,
      locator: p.locator,
      url: p.url,
    })),
    rejectedSources: retrievalResult.rejectedSources,
    modelsAttempted: Array.from(new Set([...queryModels, ...answerModels])),
  };

  return {
    question: trimmedQuestion,
    answer,
    sources: retrievalResult.passages,
    queriesUsed: retrievalResult.queriesUsed,
    debugInfo,
  };
}

export { analyzeAndGenerateQueries as generateArabicSearchQueries };
export { retrieveNususPassages as searchTurathCorpus };
