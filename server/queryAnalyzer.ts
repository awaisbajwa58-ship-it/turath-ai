import { SourceFilterType, ResearchMode } from '../src/types.js';
import { llmProvider } from './providers/llmProvider.js';

export interface RejectedQuery {
  query: string;
  reason: string;
}

export interface QuestionIntent {
  keywords: string[];
  language: 'urdu' | 'arabic' | 'roman_urdu' | 'mixed';
  targetFilter: SourceFilterType;
  domain: string;
  mainSubject: string;
  claim?: string;
  requestedMadhhab?: string;
  isComparative: boolean;
  isOpposingRequested: boolean;
  subQuestions?: string[];
  internalClassifications?: string[];
  structuredAnalysis?: {
    topic: string;
    subject: string;
    action: string;
    person: string;
    condition: string;
    circumstance: string;
    requested_ruling: string;
    requested_information: string;
    madhhab: string;
    category: string;
    selected_books: string[];
    selected_authors: string[];
    search_intent: string;
    exclusions: string[];
    key_concepts: string[];
    Arabic_terms: string[];
    synonyms: string[];
  };
  multiStrategyQueries: {
    exact: string[];
    terminology: string[];
    classicalArabic: string[];
    synonyms: string[];
    conceptual: string[];
    reformulated: string[];
    opposing: string[];
  };
  researchPlan?: {
    research_level: number;
    search_tasks: string[];
    required_evidence_types: string[];
    required_conditions: string[];
    required_exceptions: string[];
  };
}

export interface QueryAnalysisResult {
  selectedMode: ResearchMode;
  detectedMode: ResearchMode;
  intent: QuestionIntent;
  generatedQueries: string[];
  rejectedQueries: RejectedQuery[];
  modelsAttempted: string[];
}

/**
 * Detect research mode from question text
 */
export function detectResearchMode(
  question: string,
  manualMode: ResearchMode = 'auto'
): ResearchMode {
  if (manualMode && manualMode !== 'auto') {
    return manualMode;
  }

  const norm = question.toLowerCase();

  // 1. Exact / Literal Search Triggers
  const hasQuotes = /"[^"]{3,}"|'[^']{3,}'|«[^»]{3,}»/.test(question);
  const exactPatterns = [
    'یہ لفظ کہاں کہاں',
    'یہ عبارت تلاش',
    'اسی عبارت کے مقامات',
    'کن کتابوں میں آئے',
    'عین عبارت',
    'بالکل یہی عبارت',
    'تلاش لفظی',
    'عبارت:',
  ];
  if (hasQuotes || exactPatterns.some((p) => norm.includes(p))) {
    return 'exact';
  }

  // 2. Similar Phrase Search Triggers
  const similarPatterns = [
    'ملتی جلتی عبارت',
    'ملتی جلتی عبارات',
    'اس جیسی عبارت',
    'اسی مفہوم یا اسلوب',
    'مشابہ عبارت',
    'اسی اسلوب کی',
    'ہم معنی عبارات',
  ];
  if (similarPatterns.some((p) => norm.includes(p))) {
    return 'similar';
  }

  // 3. Conclusion / Inference-Oriented Search Triggers
  const conclusionPatterns = [
    'یہ نتیجہ نکلتا',
    'نتیجہ نکلتا ہو',
    'یہ حکم معلوم ہوتا',
    'ثابت ہوتی ہو',
    'نتیجے کی بنیاد',
    'استدلال',
    'استنباط',
    'موقف کے مخالف',
    'مخالف عبارات',
    'رد کرتی ہوں',
    'رد کرتی ہو',
    'ثابت ہوتا ہے',
  ];
  if (conclusionPatterns.some((p) => norm.includes(p))) {
    return 'conclusion';
  }

  return 'semantic';
}

/**
 * Detect if user explicitly requested opposing/contrary evidence
 */
export function detectOpposingRequested(question: string): boolean {
  const opposingKeywords = [
    'مخالف',
    'مخالفت',
    'رد کرتی',
    'رد کرتا',
    'شکوک',
    'اعتراض',
    'إنكار',
    'ليس بحجة',
    'مناقشة',
    'عدم حجية',
  ];
  return opposingKeywords.some((k) => question.includes(k));
}

/**
 * Detect if user question requests a comparative fiqh analysis between madhhabs
 */
export function detectComparativeQuestion(question: string): boolean {
  const compKeywords = [
    'اور',
    'اختلاف',
    'مقارنہ',
    'حنفی اور شافعی',
    'شافعیہ',
    'مالکیہ',
    'حنابلہ',
    'مذاہب اربعہ',
    'فقہاء کا اختلاف',
    'عند الفقهاء',
    'مختلف مدارس',
  ];
  return compKeywords.some((k) => question.includes(k));
}

/**
 * Arabic orthographic & morphological normalization
 */
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel/diacritics
    .replace(/[أإآء]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[؟?،!.,؛]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Offline concept rules for fallback/bootstrapping
 */
interface ConceptRule {
  triggerWords: string[];
  mainSubject: string;
  domain: string;
  terms: {
    exact: string[];
    terminology: string[];
    classicalArabic: string[];
    synonyms: string[];
    conceptual: string[];
    reformulated: string[];
    opposing: string[];
  };
}

const CONCEPT_RULES: ConceptRule[] = [
  {
    triggerWords: ['اجماع', 'إجماع'],
    mainSubject: 'الإجماع',
    domain: 'أصول الفقه',
    terms: {
      exact: ['الإجماع'],
      terminology: ['حجية الإجماع', 'شروط الإجماع'],
      classicalArabic: ['الإجماع حجة قطعية', 'اتفاق المجتهدين من هذه الأمة'],
      synonyms: ['اتفاق الأمة', 'إجماع الفقهاء'],
      conceptual: ['الإجماع دليل شرعي', 'انعقد الإجماع على'],
      reformulated: ['حجة اتفاق أمة محمد'],
      opposing: ['إنكار الإجماع', 'ليس بحجة', 'مناقشة الإجماع'],
    },
  },
  {
    triggerWords: ['قیاس', 'قياس'],
    mainSubject: 'القياس',
    domain: 'أصول الفقه',
    terms: {
      exact: ['القياس'],
      terminology: ['حجية القياس', 'أركان القياس', 'علة الحكم'],
      classicalArabic: ['القياس جلي وخفي', 'حمل فرع على اصل في حكم لعلة'],
      synonyms: ['الاستدلال بالقياس'],
      conceptual: ['القياس أصل من أصول الشريعة'],
      reformulated: ['حجية القياس الشرعي'],
      opposing: ['إبطال القياس', 'إنكار القياس'],
    },
  },
  {
    triggerWords: ['استحسان'],
    mainSubject: 'الاستحسان',
    domain: 'أصول الفقه',
    terms: {
      exact: ['الاستحسان'],
      terminology: ['حجية الاستحسان', 'الاستحسان عند الحنفية'],
      classicalArabic: ['العدول عن قياس جلي إلى قياس خفي'],
      synonyms: ['استحسان الأصوليين'],
      conceptual: ['الترك للقياس لدليل أقوى'],
      reformulated: ['العمل بالاستحسان'],
      opposing: ['من استحسن فقد شرع'],
    },
  },
  {
    triggerWords: ['وضو', 'وضوء'],
    mainSubject: 'الوضوء',
    domain: 'الفقه',
    terms: {
      exact: ['الوضوء'],
      terminology: ['فرائض الوضوء', 'أركان الوضوء', 'سنن الوضوء'],
      classicalArabic: ['غسل الوجه واليدين إلى المرفقين ومسح الرأس'],
      synonyms: ['طهارة الحدث الأصغر'],
      conceptual: ['شروط صحة الوضوء'],
      reformulated: ['حكم أركان الطهارة'],
      opposing: ['نواقض الوضوء'],
    },
  },
  {
    triggerWords: ['مسح'],
    mainSubject: 'المسح',
    domain: 'الفقه',
    terms: {
      exact: ['مسح الرأس'],
      terminology: ['قدر المسح الواجب', 'مسح الخفين'],
      classicalArabic: ['إصابة اليد المبلولة للرأس'],
      synonyms: ['المسح على الخفين'],
      conceptual: ['الواجب في مسح الرأس'],
      reformulated: ['مقدار فرض المسح'],
      opposing: ['اشتراط غسل الرأس'],
    },
  },
];

function isExactWordInText(word: string, text: string): boolean {
  const normWord = normalizeArabicText(word);
  const normText = normalizeArabicText(text);
  if (normWord.includes(' ')) {
    return normText.includes(normWord);
  }
  const tokens = normText.split(' ');
  return tokens.includes(normWord);
}

/**
 * Strict Morphological and Semantic Validation Guard
 */
export function validateAndFilterQueries(
  rawQueries: string[],
  userQuestion: string
): { validQueries: string[]; rejectedQueries: RejectedQuery[] } {
  const normQuestion = normalizeArabicText(userQuestion);
  const wordsInQuestion = new Set(normQuestion.split(' '));

  const validQueries: string[] = [];
  const rejectedQueries: RejectedQuery[] = [];

  const isAskingAboutHajj =
    wordsInQuestion.has('حج') || wordsInQuestion.has('الحج') || normQuestion.includes('مناسك');
  const isAskingAboutHujjiya =
    normQuestion.includes('حجية') || normQuestion.includes('حجیت') || normQuestion.includes('حجة');
  const isAskingAboutIjma = normQuestion.includes('اجماع') || normQuestion.includes('إجماع');
  const isAskingAboutMasah = normQuestion.includes('مسح');

  for (const q of rawQueries) {
    const normQ = normalizeArabicText(q);
    if (!normQ || normQ.length < 2) continue;

    // Rule 1: Hujjiya (proof/authority) vs Hajj (pilgrimage) safety
    if (isAskingAboutHujjiya && !isAskingAboutHajj) {
      if (
        normQ === 'الحج' ||
        normQ.includes('مناسك الحج') ||
        normQ.includes('واجبات الحج') ||
        normQ.includes('أعمال الحج') ||
        normQ.includes('فرائض الحج')
      ) {
        rejectedQueries.push({
          query: q,
          reason: "Semantic mismatch: 'حجیت' (proof/binding authority) is not 'الحج' (Hajj pilgrimage)",
        });
        continue;
      }
    }

    // Rule 2: Masah vs Messiah
    if (isAskingAboutMasah && normQ.includes('مسيح') && !normQ.includes('رأس') && !normQ.includes('خفين')) {
      rejectedQueries.push({
        query: q,
        reason: "Morphological safety: 'مسح' (wiping) is not 'مسيح' (Messiah)",
      });
      continue;
    }

    // Rule 3: Ijma vs Mosque/Jami
    if (
      isAskingAboutIjma &&
      !normQuestion.includes('مسجد') &&
      (normQ.includes('جامع') || normQ.includes('بناء المسجد'))
    ) {
      rejectedQueries.push({
        query: q,
        reason: "Semantic mismatch: 'اجماع' (consensus) is not 'جامع' (Mosque)",
      });
      continue;
    }

    validQueries.push(q);
  }

  return { validQueries, rejectedQueries };
}

function classifyQueryInternally(
  question: string,
  intent: Partial<QuestionIntent>,
  selectedMode: ResearchMode
): string[] {
  const classifications: string[] = [];
  const norm = question.toLowerCase();

  // 1. Term/Word occurrence search check
  const occurrenceKeywords = [
    'کہاں کہاں',
    'لفظ کہاں',
    'مقامات',
    'لفظ استحسان کہاں',
    'کون کون سی کتاب',
    'تلاش لفظی',
    'کتنی جگہ',
    'ورود',
    'تکرار',
    'لفظ'
  ];
  if (occurrenceKeywords.some((k) => norm.includes(k))) {
    classifications.push('TERM_OCCURRENCE');
  }

  // 2. Fiqh ruling check
  const rulingKeywords = [
    'حکم',
    'جائز',
    'ناجائز',
    'حلال',
    'حرام',
    'مکروہ',
    'واجب',
    'فرض',
    'سنت',
    'مستحب',
    'صحیح',
    'باطل',
    'فاسد'
  ];
  if (rulingKeywords.some((k) => norm.includes(k))) {
    classifications.push('FIQH_RULING');
  }

  // 3. Exact phrase check
  const hasQuotes = /"[^"]{3,}"|'[^']{3,}'|«[^»]{3,}»/.test(question);
  if (hasQuotes || selectedMode === 'exact' || norm.includes('یہ عبارت') || norm.includes('عین عبارت')) {
    classifications.push('EXACT_PHRASE');
  }

  // 4. Similar phrase check
  if (selectedMode === 'similar' || norm.includes('ملتی جلتی عبارت') || norm.includes('ہم معنی عبارت')) {
    classifications.push('SIMILAR_PHRASE');
  }

  // 5. Condition search check
  if (norm.includes('شرط') || norm.includes('شروط') || norm.includes('بشرط')) {
    classifications.push('CONDITION_SEARCH');
  }

  // 6. Exception search check
  if (norm.includes('استثناء') || norm.includes('الا') || norm.includes('عذر') || norm.includes('ضرورت')) {
    classifications.push('EXCEPTION_SEARCH');
  }

  // 7. Comparative check
  if (intent.isComparative || norm.includes('اختلاف') || norm.includes('شافعی') || norm.includes('مالکی') || norm.includes('حنبلی')) {
    classifications.push('COMPARATIVE_RESEARCH');
  }

  // 8. Translation & Citation requested
  if (norm.includes('ترجمہ')) {
    classifications.push('TRANSLATION_REQUEST');
  }
  if (norm.includes('حوالہ') || norm.includes('حوالہ جات') || norm.includes('سند') || norm.includes('کتاب کا نام')) {
    classifications.push('CITATION_REQUEST');
  }

  // 9. Multi part check
  if (intent.subQuestions && intent.subQuestions.length > 1) {
    classifications.push('MULTI_PART_QUESTION');
    classifications.push('MULTI_SOURCE_RESEARCH');
  }

  // 10. Default factual or conceptual
  if (classifications.length === 0) {
    classifications.push('DIRECT_FACTUAL');
  } else {
    classifications.push('CONCEPTUAL_SEARCH');
  }

  return Array.from(new Set(classifications));
}

/**
 * Main Question Analyzer & Multi-Query Generator
 */
export async function analyzeAndGenerateQueries(
  userQuestion: string,
  filter: SourceFilterType = 'all',
  manualMode: ResearchMode = 'auto',
  apiKey?: string
): Promise<QueryAnalysisResult> {
  const modelsAttempted: string[] = [];
  const cleanedQuestion = userQuestion.replace(/[؟?،!.,]/g, '').trim();

  // Detect mode, opposing, and comparative flags
  const detectedMode = detectResearchMode(userQuestion, manualMode);
  const selectedMode = manualMode !== 'auto' ? manualMode : detectedMode;
  const isOpposingRequested = detectOpposingRequested(userQuestion);
  const isComparative = detectComparativeQuestion(userQuestion);

  // Language detection
  const hasArabicChars = /[\u0600-\u06FF]/.test(userQuestion);
  const isUrduSpecific = /[ٹڈڑںےہٹڈپچژکگ]/.test(userQuestion);
  const isRomanUrdu = !hasArabicChars && /[a-zA-Z]/.test(userQuestion);

  const language = isRomanUrdu
    ? 'roman_urdu'
    : isUrduSpecific
    ? 'urdu'
    : hasArabicChars
    ? 'arabic'
    : 'mixed';

  // Offline Concept Rules Matching
  let detectedMainSubject = 'مسألة شرعية';
  let detectedDomain = filter === 'usul' ? 'أصول الفقه' : filter === 'hanafi' ? 'الفقه الحنفي' : 'الفقه';

  const multiStrategyOffline: QuestionIntent['multiStrategyQueries'] = {
    exact: [],
    terminology: [],
    classicalArabic: [],
    synonyms: [],
    conceptual: [],
    reformulated: [],
    opposing: [],
  };

  for (const rule of CONCEPT_RULES) {
    if (rule.triggerWords.some((tw) => isExactWordInText(tw, userQuestion))) {
      detectedMainSubject = rule.mainSubject;
      detectedDomain = rule.domain;
      multiStrategyOffline.exact.push(...rule.terms.exact);
      multiStrategyOffline.terminology.push(...rule.terms.terminology);
      multiStrategyOffline.classicalArabic.push(...rule.terms.classicalArabic);
      multiStrategyOffline.synonyms.push(...rule.terms.synonyms);
      multiStrategyOffline.conceptual.push(...rule.terms.conceptual);
      multiStrategyOffline.reformulated.push(...rule.terms.reformulated);
      if (isOpposingRequested) {
        multiStrategyOffline.opposing.push(...rule.terms.opposing);
      }
    }
  }

  // Attempt LLM Analysis via LLMProvider
  const llmResult = await llmProvider.analyzeQuestion(userQuestion, filter, selectedMode, apiKey);

  if (llmResult && llmResult.queries) {
    const queries = llmResult.queries || {};
    const combinedLLMQueries = [
      ...(queries.exact || []),
      ...(queries.terminology || []),
      ...(queries.classicalArabic || []),
      ...(queries.synonyms || []),
      ...(queries.conceptual || []),
      ...(queries.reformulated || []),
      ...(queries.opposing || []),
    ];

    const normalizedRaw = combinedLLMQueries
      .map((q) => (typeof q === 'string' ? normalizeArabicText(q) : ''))
      .filter((q) => q.length > 2);

    const { validQueries, rejectedQueries } = validateAndFilterQueries(
      normalizedRaw,
      userQuestion
    );

    if (validQueries.length > 0) {
      const intentObj: QuestionIntent = {
        keywords: validQueries,
        language,
        targetFilter: filter,
        domain: llmResult.domain || detectedDomain,
        mainSubject: llmResult.mainSubject || detectedMainSubject,
        claim: llmResult.claim || '',
        requestedMadhhab: llmResult.requestedMadhhab || (filter === 'hanafi' ? 'الحنفي' : undefined),
        isComparative: llmResult.isComparative || isComparative,
        isOpposingRequested,
        subQuestions: llmResult.subQuestions || [userQuestion],
        structuredAnalysis: llmResult.structuredAnalysis,
        multiStrategyQueries: {
          exact: (queries.exact || []).map(normalizeArabicText).filter(Boolean),
          terminology: (queries.terminology || []).map(normalizeArabicText).filter(Boolean),
          classicalArabic: (queries.classicalArabic || []).map(normalizeArabicText).filter(Boolean),
          synonyms: (queries.synonyms || []).map(normalizeArabicText).filter(Boolean),
          conceptual: (queries.conceptual || []).map(normalizeArabicText).filter(Boolean),
          reformulated: (queries.reformulated || []).map(normalizeArabicText).filter(Boolean),
          opposing: (queries.opposing || []).map(normalizeArabicText).filter(Boolean),
        },
        researchPlan: llmResult.researchPlan,
      };

      intentObj.internalClassifications = classifyQueryInternally(userQuestion, intentObj, selectedMode);

      return {
        selectedMode,
        detectedMode,
        intent: intentObj,
        generatedQueries: Array.from(new Set(validQueries)).slice(0, 8),
        rejectedQueries,
        modelsAttempted: ['gemini-3.6-flash'],
      };
    }
  }

  // Fallback Offline Combined Query set
  const allOffline = Array.from(
    new Set([
      ...multiStrategyOffline.exact,
      ...multiStrategyOffline.terminology,
      ...multiStrategyOffline.classicalArabic,
      ...multiStrategyOffline.synonyms,
      ...multiStrategyOffline.conceptual,
      ...multiStrategyOffline.reformulated,
      ...multiStrategyOffline.opposing,
      normalizeArabicText(cleanedQuestion),
    ])
  ).filter((q) => q.length > 2);

  const { validQueries, rejectedQueries } = validateAndFilterQueries(allOffline, userQuestion);
  const finalQueries = validQueries.length > 0 ? validQueries.slice(0, 8) : [normalizeArabicText(cleanedQuestion)];

  const fallbackIntent: QuestionIntent = {
    keywords: finalQueries,
    language,
    targetFilter: filter,
    domain: detectedDomain,
    mainSubject: detectedMainSubject,
    isComparative,
    isOpposingRequested,
    multiStrategyQueries: multiStrategyOffline,
  };

  fallbackIntent.internalClassifications = classifyQueryInternally(userQuestion, fallbackIntent, selectedMode);

  return {
    selectedMode,
    detectedMode,
    intent: fallbackIntent,
    generatedQueries: finalQueries,
    rejectedQueries,
    modelsAttempted,
  };
}
