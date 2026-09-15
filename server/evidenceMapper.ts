import { SourceCitation } from '../src/types.js';
import { normalizeArabicText } from './queryAnalyzer.js';

export type EvidenceRole =
  | 'rule'
  | 'condition'
  | 'qualification'
  | 'exception'
  | 'restriction'
  | 'definition'
  | 'cause'
  | 'consequence'
  | 'alternative'
  | 'disagreement'
  | 'supporting_evidence'
  | 'opposing_evidence'
  | 'explanation'
  | 'uncertain'
  | 'DIRECT_RULING'
  | 'CONDITION'
  | 'QUALIFICATION'
  | 'EXCEPTION'
  | 'CAUSE'
  | 'CONSEQUENCE'
  | 'QUANTITY'
  | 'DEFINITION'
  | 'SUPPORTING'
  | 'BACKGROUND'
  | 'IRRELEVANT';

export type RelationshipType =
  | 'SUPPORTS'
  | 'QUALIFIES'
  | 'LIMITS'
  | 'EXCEPTS'
  | 'EXPLAINS'
  | 'DEFINES'
  | 'APPLIES'
  | 'CONTRADICTS'
  | 'REFINES'
  | 'REPEATS';

export interface EvidenceRelation {
  sourceId: string; // "bookId_page"
  targetId: string;
  relation: RelationshipType;
  description: string;
}

export interface EvidenceMap {
  claims: Array<{
    claimText: string;
    evidenceRole: EvidenceRole;
    citations: SourceCitation[];
  }>;
  relations: EvidenceRelation[];
  criticFlags: string[];
}

/**
 * Classifies the specific role of a retrieved passage using classical Fiqh keywords
 * and sophisticated contextual semantic rules.
 */
export function classifyEvidenceRole(text: string, semanticRole?: string): EvidenceRole {
  if (semanticRole) {
    const sr = semanticRole.trim().toLowerCase();
    const validRoles = [
      'rule', 'condition', 'qualification', 'exception', 'restriction', 
      'definition', 'cause', 'consequence', 'alternative', 'disagreement', 
      'supporting_evidence', 'opposing_evidence', 'explanation', 'uncertain'
    ];
    if (validRoles.includes(sr)) {
      return sr as EvidenceRole;
    }
    if (sr === 'supporting evidence') return 'supporting_evidence';
    if (sr === 'opposing evidence') return 'opposing_evidence';
  }

  const norm = normalizeArabicText(text);

  // If there's an explicit, strong condition marker:
  const strongConditionMarkers = ['بشرط', 'شريطه', 'شرط'];
  if (strongConditionMarkers.some((m) => norm.includes(m))) {
    return 'condition';
  }

  // Scholar Opinion / Disagreement Markers
  const scholarOpinionMarkers = [
    'خلافا', 'خالفه', 'خلافا ل', 'عند ابي حنيفة', 'عند الشافعي', 'عند مالك', 
    'وقال الشافعي', 'وقال مالك', 'وقال احمد', 'وقال ابو يوسف', 'وقال محمد', 'عند الصاحبين',
    'عند الجمهور', 'مذهب الجمهور', 'مذهب الشافعية', 'مذهب الحنفية'
  ];
  if (scholarOpinionMarkers.some((m) => norm.includes(m))) {
    return 'disagreement';
  }

  // General condition/exception words - we must be VERY careful here so they don't trigger false positives
  // "إذا", "عند", "لكن", "على", "نحو", "إلا", "غير"
  const generalExceptions = ['الا', 'غير', 'ما عدا', 'مستثنى', 'الا ان'];
  if (generalExceptions.some((m) => norm.includes(m))) {
    const ambiguousExceptions = ['لكن قال', 'غير ان الشافعي', 'الا قال', 'على نحو'];
    if (ambiguousExceptions.some((m) => norm.includes(m))) {
      return 'uncertain';
    }
    return 'exception';
  }

  const generalConditionWords = ['اذا', 'ان كان', 'عند', 'ما لم', 'على ان'];
  if (generalConditionWords.some((m) => norm.includes(m))) {
    const scholarNames = [
      'ابي حنيفة', 'ابى حنيفة', 'ابي يوسف', 'محمد', 'الشافعي', 'مالك', 'احمد', 'العلماء', 
      'الجمهور', 'اصحابنا', 'الصحابه', 'التابعين', 'الائمه', 'الفقهاء', 'الحنفية', 'المالكية', 
      'الشافعية', 'الحنابلة'
    ];
    
    // Check if "عند" or "إذا" is followed by a scholar name in close proximity
    let hasScholarMatch = false;
    for (const name of scholarNames) {
      if (norm.includes(`عند ${name}`) || norm.includes(`اذا قال ${name}`) || norm.includes(`عند قول ${name}`)) {
        hasScholarMatch = true;
        break;
      }
    }
    
    if (hasScholarMatch) {
      return 'disagreement';
    }

    // "على" or "نحو" can be highly ambiguous without direct condition indicators.
    if (norm.includes('على هذا') || norm.includes('على المذهب') || norm.includes('على انه') || norm.includes('نحو ذلك')) {
      return 'uncertain';
    }

    return 'condition';
  }

  // Restriction markers
  const restrictionMarkers = ['لا يجوز', 'يمنع', 'حرام', 'ممنوع', 'محظور', 'قيد', 'مقيد'];
  if (restrictionMarkers.some((m) => norm.includes(m))) {
    return 'restriction';
  }

  // Consequence / liability markers
  const consequenceMarkers = ['فديه', 'تجب', 'يلزمه', 'عليه الدم', 'فعليه', 'جزاء', 'وجب عليه'];
  if (consequenceMarkers.some((m) => norm.includes(m))) {
    return 'consequence';
  }

  // Definition markers
  const definitionMarkers = ['هو', 'يعني', 'حده', 'تعريفه', 'المراد به'];
  if (definitionMarkers.some((m) => norm.includes(m)) && norm.length < 300) {
    return 'definition';
  }

  return 'rule';
}

/**
 * Builds a query-time evidence relationship graph among retrieved passages.
 * Implements evidence sufficiency verification based on semantic structure.
 */
export function buildEvidenceMap(
  passages: SourceCitation[],
  userQuestion: string,
  intent?: any,
  plan?: any
): EvidenceMap {
  const claims: Array<{
    claimText: string;
    evidenceRole: EvidenceRole;
    citations: SourceCitation[];
  }> = [];

  const relations: EvidenceRelation[] = [];
  const criticFlags: string[] = [];

  // Group citations by classified role
  const roleGroups = new Map<EvidenceRole, SourceCitation[]>();
  for (const p of passages) {
    // Prioritize any native semantic role assigned by Gemini if available
    const role = classifyEvidenceRole(p.arabic_text, (p as any).semantic_role || p.evidence_label_urdu);
    p.evidence_level = ['exception', 'EXCEPTION', 'condition', 'CONDITION'].includes(role) ? 'DIRECT' : p.evidence_level;
    
    if (!roleGroups.has(role)) {
      roleGroups.set(role, []);
    }
    roleGroups.get(role)!.push(p);
  }

  // Map to structured claims with beautiful Urdu labels
  roleGroups.forEach((citations, role) => {
    let label = 'تفصیل';
    const r = String(role).toLowerCase();
    if (r === 'rule' || role === 'DIRECT_RULING') label = 'بنیادی شرعی حکم (Rule)';
    else if (r === 'condition' || role === 'CONDITION') label = 'شرط و حدود (Condition)';
    else if (r === 'qualification' || role === 'QUALIFICATION') label = 'توجیہ / تخصیص (Qualification)';
    else if (r === 'exception' || role === 'EXCEPTION') label = 'استثنائی صورت حال (Exception)';
    else if (r === 'restriction') label = 'قید / ممانعت (Restriction)';
    else if (r === 'definition' || role === 'DEFINITION') label = 'اصطلاحی تعریف (Definition)';
    else if (r === 'cause' || role === 'CAUSE') label = 'علت / سبب (Cause)';
    else if (r === 'consequence' || role === 'CONSEQUENCE') label = 'لازمہ / فدیہ / جزاء (Consequence)';
    else if (r === 'alternative') label = 'متبادل عمل (Alternative)';
    else if (r === 'disagreement') label = 'اختلافی موقف (Disagreement)';
    else if (r === 'supporting_evidence' || role === 'SUPPORTING') label = 'مؤید شواہد (Supporting)';
    else if (r === 'opposing_evidence') label = 'مخالف دلیل (Opposing)';

    claims.push({
      claimText: label,
      evidenceRole: role,
      citations,
    });
  });

  // Analyze relationships
  for (let i = 0; i < passages.length; i++) {
    const p1 = passages[i];
    const key1 = `${p1.book_id}_${p1.internalPage}`;
    const r1 = classifyEvidenceRole(p1.arabic_text, (p1 as any).semantic_role || p1.evidence_label_urdu);

    for (let j = i + 1; j < passages.length; j++) {
      const p2 = passages[j];
      const key2 = `${p2.book_id}_${p2.internalPage}`;
      const r2 = classifyEvidenceRole(p2.arabic_text, (p2 as any).semantic_role || p2.evidence_label_urdu);

      const r1Lower = String(r1).toLowerCase();
      const r2Lower = String(r2).toLowerCase();

      if ((r1Lower === 'rule' || r1 === 'DIRECT_RULING') && (r2Lower === 'condition' || r2 === 'CONDITION')) {
        relations.push({
          sourceId: key2,
          targetId: key1,
          relation: 'QUALIFIES',
          description: `Book "${p2.book}" conditions/restricts the broader ruling in "${p1.book}"`,
        });
      } else if ((r1Lower === 'rule' || r1 === 'DIRECT_RULING') && (r2Lower === 'exception' || r2 === 'EXCEPTION')) {
        relations.push({
          sourceId: key2,
          targetId: key1,
          relation: 'EXCEPTS',
          description: `Book "${p2.book}" outlines an exception to the general ruling in "${p1.book}"`,
        });
      } else if ((r1Lower === 'rule' || r1 === 'DIRECT_RULING') && (r2Lower === 'consequence' || r2 === 'CONSEQUENCE')) {
        relations.push({
          sourceId: key2,
          targetId: key1,
          relation: 'LIMITS',
          description: `Book "${p2.book}" defines liability/consequences for the ruling in "${p1.book}"`,
        });
      } else if (p1.book === p2.book) {
        relations.push({
          sourceId: key2,
          targetId: key1,
          relation: 'EXPLAINS',
          description: `Different pages/sections within same work "${p1.book}" supplement each other`,
        });
      }
    }
  }

  // LOGICAL EVIDENCE SUFFICIENCY CRITIC LAYER
  const normQ = normalizeArabicText(userQuestion);
  const subquestions = intent?.subQuestions || plan?.subQuestions || [userQuestion];

  // 1. Core Rule Check
  const hasRule = roleGroups.has('rule') || roleGroups.has('DIRECT_RULING');
  if (!hasRule && passages.length === 0) {
    criticFlags.push('UNSUPPORTED_CLAIM: No direct (صريح) textual evidence retrieved to prove primary legal claim.');
  }

  // 2. Condition Verification Check
  const conditionsToVerify = plan?.conditionsToVerify || intent?.researchPlan?.required_conditions || [];
  const hasConditionWord = normQ.includes('اگر') || normQ.includes('شرط') || normQ.includes('بشرط');
  const conditionFound = roleGroups.has('condition') || roleGroups.has('CONDITION');
  if ((conditionsToVerify.length > 0 || hasConditionWord) && !conditionFound) {
    criticFlags.push('MISSING_CONDITION: Question involves conditions or conditional circumstances, but no conditional passage (condition/CONDITION) is classified.');
  }

  // 3. Exception Verification Check
  const exceptionsToVerify = plan?.exceptionsToVerify || intent?.researchPlan?.required_exceptions || [];
  const hasExceptionWord = normQ.includes('عذر') || normQ.includes('ضرورت') || normQ.includes('مجبوری') || normQ.includes('استثنا');
  const exceptionFound = roleGroups.has('exception') || roleGroups.has('EXCEPTION');
  if ((exceptionsToVerify.length > 0 || hasExceptionWord) && !exceptionFound) {
    criticFlags.push('MISSING_EXCEPTION: Question involves excuses/necessity, but no exception passage (exception/EXCEPTION) is classified.');
  }

  // 4. Sub-questions Coverage Check
  if (subquestions.length > 1 && passages.length < subquestions.length) {
    criticFlags.push(`INSUFFICIENT_COVERAGE: Question has ${subquestions.length} distinct sub-questions, but only ${passages.length} source passages are available.`);
  }

  // Citation Integrity Checks
  for (const p of passages) {
    if (!p.book || !p.arabic_text) {
      criticFlags.push(`CITATION_MISMATCH: Invalid citation object retrieved without book title or Arabic verbatim.`);
    }
  }

  return {
    claims,
    relations,
    criticFlags,
  };
}
