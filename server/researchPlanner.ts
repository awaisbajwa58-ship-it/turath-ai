import { SourceFilterType } from '../src/types.js';
import { normalizeArabicText } from './queryAnalyzer.js';

export interface ResearchPlan {
  questionType: string[];
  mainQuestion: string;
  subQuestions: string[];
  researchTasks: string[];
  keyConcepts: string[];
  requiredEvidenceTypes: string[];
  searchStrategies: string[];
  conditionsToVerify: string[];
  exceptionsToVerify: string[];
  exclusions: string[];
  sourceScope: string;
  researchDepth: 'level1' | 'level2' | 'level3';
  complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
  stormPerspectives?: string[];
}

/**
 * Creates an internal, structured Research Plan for any user question.
 * Uses deterministic Urdu & Arabic parsing rules for ultra-high speed (0ms overhead),
 * supporting full decomposition, key concept formulation, and exception mapping.
 */
export function createResearchPlan(
  question: string,
  filter: SourceFilterType = 'all',
  options?: {
    categoryId?: string;
    bookIds?: string[];
    authorId?: string;
  },
  intent?: any
): ResearchPlan {
  const norm = question.toLowerCase();
  const subQuestions: string[] = intent?.subQuestions || [];
  const keyConcepts: string[] = intent?.structuredAnalysis?.key_concepts || [];
  const requiredEvidenceTypes: string[] = intent?.researchPlan?.required_evidence_types || ['DIRECT_RULING'];
  const searchStrategies: string[] = [];
  const conditionsToVerify: string[] = intent?.researchPlan?.required_conditions || [];
  const exceptionsToVerify: string[] = intent?.researchPlan?.required_exceptions || [];
  const exclusions: string[] = intent?.structuredAnalysis?.exclusions || [];
  const questionType: string[] = [];

  // 1. Question Decomposition Fallback
  if (subQuestions.length === 0) {
    const splitters = /[؟?؛;]/;
    const rawParts = question.split(splitters).map((p) => p.trim()).filter((p) => p.length > 5);

    if (rawParts.length > 1) {
      subQuestions.push(...rawParts);
    } else {
      // Attempt split by 'اور' (and) or 'اگر' (if)
      const andParts = question.split(/\s+اور\s+/).map((p) => p.trim()).filter((p) => p.length > 5);
      if (andParts.length > 1) {
        subQuestions.push(...andParts);
      } else {
        subQuestions.push(question);
      }
    }
  }

  // 2. Identify Key Concepts Fallback
  if (keyConcepts.length === 0) {
    if (norm.includes('اجماع') || norm.includes('إجماع')) {
      keyConcepts.push('الإجماع');
      questionType.push('EVIDENCE', 'SOURCE_IDENTIFICATION');
      searchStrategies.push('Terminology search', 'Conceptual search');
    }
    if (norm.includes('قیاس') || norm.includes('قياس')) {
      keyConcepts.push('القياس');
      questionType.push('EVIDENCE', 'DEFINITION');
      searchStrategies.push('Terminology search', 'Cause/illah search');
    }
    if (norm.includes('استحسان')) {
      keyConcepts.push('الاستحسان');
      questionType.push('EVIDENCE', 'EXCEPTION');
      searchStrategies.push('Conceptual search');
    }
    if (norm.includes('وضو') || norm.includes('وضوء')) {
      keyConcepts.push('الوضوء');
      questionType.push('DIRECT_RULING', 'CONDITION');
    }
    if (norm.includes('مسح')) {
      keyConcepts.push('المسح');
      questionType.push('DIRECT_RULING', 'QUANTITY');
    }
    if (norm.includes('حج') || norm.includes('احرام') || norm.includes('إحرام')) {
      keyConcepts.push('الحج', 'الإحرام');
      questionType.push('DIRECT_RULING', 'FATWA');
    }
  }

  // 3. Detect Conditions & Exceptions Fallback
  if (conditionsToVerify.length === 0 && (norm.includes('اگر') || norm.includes('بشرط') || norm.includes('شرط') || norm.includes('صورت'))) {
    conditionsToVerify.push('شرط صحت', 'حالت / صورت');
    searchStrategies.push('Condition search', 'Qualification search');
    if (!requiredEvidenceTypes.includes('CONDITION')) requiredEvidenceTypes.push('CONDITION');
    if (!questionType.includes('CONDITION')) questionType.push('CONDITION');
  }
  if (exceptionsToVerify.length === 0 && (norm.includes('مجبوری') || norm.includes('ضرورت') || norm.includes('عذر') || norm.includes('استثنا'))) {
    exceptionsToVerify.push('حالت ضرورت', 'عذر شرعي');
    searchStrategies.push('Exception search');
    if (!requiredEvidenceTypes.includes('EXCEPTION')) requiredEvidenceTypes.push('EXCEPTION');
    if (!questionType.includes('EXCEPTION')) questionType.push('EXCEPTION');
  }

  if (norm.includes('فدیہ') || norm.includes('جزا') || norm.includes('دم')) {
    if (!keyConcepts.includes('الفدية')) keyConcepts.push('الفدية', 'الدم');
    if (!requiredEvidenceTypes.includes('CONSEQUENCE')) requiredEvidenceTypes.push('CONSEQUENCE');
    if (!questionType.includes('CONSEQUENCE')) questionType.push('CONSEQUENCE');
  }

  // Default question type if none detected
  if (questionType.length === 0) {
    questionType.push('DIRECT_RULING');
  }

  // Define scope
  let sourceScope = 'All classical Islamic works';
  if (options?.bookIds && options.bookIds.length > 0) {
    sourceScope = `Restricted to specific books: ${options.bookIds.join(', ')}`;
  } else if (filter === 'hanafi' || options?.categoryId === '14') {
    sourceScope = 'Strictly restricted to Hanafi Fiqh category';
  } else if (filter !== 'all') {
    sourceScope = `Restricted to filter category: ${filter}`;
  }

  // 4. Research Complexity Routing
  let researchDepth: 'level1' | 'level2' | 'level3' = 'level1';
  const levelNum = intent?.researchPlan?.research_level;
  
  if (levelNum === 3) {
    researchDepth = 'level3';
  } else if (levelNum === 2) {
    researchDepth = 'level2';
  } else if (levelNum === 1) {
    researchDepth = 'level1';
  } else {
    // Fallback deterministic routing
    const isComparative = norm.includes('اختلاف') || norm.includes('مذاہب') || norm.includes('حنفی اور');
    const isComplexMultiPart = subQuestions.length > 2 || (conditionsToVerify.length > 0 && exceptionsToVerify.length > 0);

    if (isComparative || isComplexMultiPart || norm.includes('کیوں') || norm.includes('دلیل')) {
      researchDepth = 'level3';
    } else if (conditionsToVerify.length > 0 || exceptionsToVerify.length > 0 || norm.includes('مخالف')) {
      researchDepth = 'level2';
    } else {
      researchDepth = 'level1';
    }
  }

  const researchTasks: string[] = intent?.researchPlan?.search_tasks || [];
  if (researchTasks.length === 0) {
    researchTasks.push(`Analyze core ruling for question: "${question}"`);
    subQuestions.forEach((sub, idx) => {
      if (sub !== question) {
        researchTasks.push(`Investigate sub-component ${idx + 1}: "${sub}"`);
      }
    });
  }

  // Determine complexity
  let complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX' = 'SIMPLE';
  if (researchDepth === 'level3') {
    complexity = 'COMPLEX';
  } else if (researchDepth === 'level2') {
    complexity = 'MODERATE';
  }

  // Generate STORM Perspectives
  const stormPerspectives: string[] = [];
  if (complexity !== 'SIMPLE') {
    stormPerspectives.push('اصل حکم');
    if (norm.includes('حج') || norm.includes('احرام')) {
      stormPerspectives.push('احرام کا اثر', 'استعمال کی صورت', 'ضرورت/عذر', 'فقہ حنفی کی قید');
    } else if (norm.includes('وضو') || norm.includes('غسل') || norm.includes('تیمم') || norm.includes('مسح')) {
      stormPerspectives.push('شرائط صحت', 'مفسدات / نواقض', 'طہارت کی صورت');
    } else if (norm.includes('روزہ') || norm.includes('صوم')) {
      stormPerspectives.push('شرائط روزہ', 'مفسدات روزہ', 'رخصت / عذر شرعی', 'قضا و فدیہ');
    } else if (norm.includes('زکوۃ') || norm.includes('صدقہ')) {
      stormPerspectives.push('شرط وجوب', 'نصاب زکوۃ', 'مصارف زکوۃ', 'قید و استثناء');
    } else {
      if (conditionsToVerify.length > 0) stormPerspectives.push('شرط صحت', 'قید');
      if (exceptionsToVerify.length > 0) stormPerspectives.push('رخصت / عذر', 'استثناء');
      if (norm.includes('اختلاف') || norm.includes('مذاہب')) stormPerspectives.push('اختلاف فقہاء', 'دلائل');
    }
  }

  return {
    questionType,
    mainQuestion: question,
    subQuestions,
    researchTasks,
    keyConcepts,
    requiredEvidenceTypes,
    searchStrategies,
    conditionsToVerify,
    exceptionsToVerify,
    exclusions,
    sourceScope,
    researchDepth,
    complexity,
    stormPerspectives,
  };
}
