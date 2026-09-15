import { GoogleGenAI, Type } from '@google/genai';
import { LLMProvider, LLMAnalysisResult } from './interfaces.js';
import { SourceCitation, ResearchMode } from '../../src/types.js';

function cleanAndParseJson(text: string | undefined): any {
  if (!text || !text.trim()) {
    throw new Error('LLM response was empty or only whitespace');
  }
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '');
  }
  cleaned = cleaned.trim();
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    throw new Error(`LLM output did not begin with a valid JSON character: "${cleaned.charAt(0)}"`);
  }
  return JSON.parse(cleaned);
}

async function callGeminiWithRetry<T>(
  modelName: string,
  apiCall: () => Promise<T>,
  retries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: any = null;
  let delay = initialDelay;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await apiCall();
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      const isTransient = 
        msg.includes('503') || 
        msg.includes('UNAVAILABLE') || 
        msg.includes('high demand') || 
        msg.includes('429') || 
        msg.includes('RESOURCE_EXHAUSTED') || 
        msg.includes('rate limit');

      if (isTransient) {
        console.warn(`[GeminiLLMProvider] Model ${modelName} encountered transient error (503/429) on attempt ${attempt}. Retrying in ${delay}ms... Error: ${msg.split('\n')[0]}`);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

export class GeminiLLMProvider implements LLMProvider {
  private getAiClient(overrideKey?: string) {
    const apiKey = overrideKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async analyzeQuestion(
    question: string,
    filter: string,
    mode: ResearchMode,
    overrideKey?: string
  ): Promise<LLMAnalysisResult | null> {
    const ai = this.getAiClient(overrideKey);
    if (!ai) return null;

    const candidateModels = Array.from(
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

    const systemInstruction = `You are an expert Islamic bibliographer, Usul al-Fiqh researcher, and semantic analyzer.
Analyze the user's question and extract deep research intent, semantic sub-questions, structured jurisprudential breakdown, and multi-strategy search formulations in classical Arabic for searching the Turath / Shamela corpus.

YOU MUST GENERATE QUERIES ACROSS THESE STRATEGIES:
1. exact: Exact literal Arabic terms/phrases.
2. terminology: Key technical Usul/Fiqh terminology.
3. classicalArabic: Classical Arabic jurisprudential formulations (e.g. "اتفاق المجتهدين دليل شرعي").
4. synonyms: Synonyms and related scholarly expressions.
5. conceptual: Conceptual formulations that capture the underlying legal principle.
6. reformulated: Reformulated queries expressing the core question.
7. opposing: Opposing or qualifying formulations if critique or counter-arguments are relevant.

SEMANTIC QUESTION DECOMPOSITION MANDATE:
- Understand the question's core meaning.
- If it contains multiple distinct clauses or secondary issues (e.g. "روزہ کی حالت میں انجکشن اور ڈرپ کا کیا حکم ہے؟" contains injection and drip), split them into separate, clear, and distinct "subQuestions".
- If the question is truly a single simple issue, return a single item in "subQuestions" containing the question itself. Do not over-decompose simple questions.

RESEARCH LEVEL & INTEGRITY CRITERIA:
Determine the required research depth:
- Level 1 (Fast): Simple factual, single-issue questions.
- Level 2 (Standard): Questions with standard conditions, or requiring moderate verification.
- Level 3 (Deep): Multi-issue, comparative, complex, or highly sensitive questions.
For the researchPlan, identify what specific search tasks are needed, what evidence types must be sought, and what potential conditions or exceptions are anticipated in classical text.

CRITICAL SCHOLARLY SAFETY RULES:
- "حجیت" (Hujjiya = authority/binding proof) MUST NEVER be turned into Hajj pilgrimage (الحج / مناسك الحج).
- "اجماع" (Ijma = consensus) MUST NEVER be turned into Mosque (الجامع).
- "مسح" (Masah = wiping in wudu) MUST NEVER be turned into Messiah (المسيح).
- Remove all diacritics (harakat).`;

    const prompt = `User Question: "${question}"
Source Filter: "${filter}"
Mode: "${mode}"`;

    for (const modelName of candidateModels) {
      try {
        const response = await callGeminiWithRetry(modelName, () =>
          ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  mainSubject: { type: Type.STRING },
                  domain: { type: Type.STRING },
                  claim: { type: Type.STRING },
                  requestedMadhhab: { type: Type.STRING },
                  isComparative: { type: Type.BOOLEAN },
                  subQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  structuredAnalysis: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { type: Type.STRING },
                      subject: { type: Type.STRING },
                      action: { type: Type.STRING },
                      person: { type: Type.STRING },
                      condition: { type: Type.STRING },
                      circumstance: { type: Type.STRING },
                      requested_ruling: { type: Type.STRING },
                      requested_information: { type: Type.STRING },
                      madhhab: { type: Type.STRING },
                      category: { type: Type.STRING },
                      selected_books: { type: Type.ARRAY, items: { type: Type.STRING } },
                      selected_authors: { type: Type.ARRAY, items: { type: Type.STRING } },
                      search_intent: { type: Type.STRING },
                      exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
                      key_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                      Arabic_terms: { type: Type.ARRAY, items: { type: Type.STRING } },
                      synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
                    }
                  },
                  queries: {
                    type: Type.OBJECT,
                    properties: {
                      exact: { type: Type.ARRAY, items: { type: Type.STRING } },
                      terminology: { type: Type.ARRAY, items: { type: Type.STRING } },
                      classicalArabic: { type: Type.ARRAY, items: { type: Type.STRING } },
                      synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
                      conceptual: { type: Type.ARRAY, items: { type: Type.STRING } },
                      reformulated: { type: Type.ARRAY, items: { type: Type.STRING } },
                      opposing: { type: Type.ARRAY, items: { type: Type.STRING } },
                    }
                  },
                  researchPlan: {
                    type: Type.OBJECT,
                    properties: {
                      research_level: { type: Type.INTEGER },
                      search_tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                      required_evidence_types: { type: Type.ARRAY, items: { type: Type.STRING } },
                      required_conditions: { type: Type.ARRAY, items: { type: Type.STRING } },
                      required_exceptions: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                  }
                }
              }
            },
          })
        );

        if (response.text) {
          const parsed = cleanAndParseJson(response.text);
          return parsed as LLMAnalysisResult;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          console.warn(`[GeminiLLMProvider] model ${modelName} analyze rate limited (429)`);
        } else {
          console.warn(`[GeminiLLMProvider] model ${modelName} analyze failed:`, msg.split('\n')[0]);
        }
      }
    }

    return null;
  }

  async synthesizeAnswer(
    userQuestion: string,
    passages: SourceCitation[],
    isComparative: boolean = false,
    overrideKey?: string
  ): Promise<{
    summary: string;
    detail: string;
    istidlal_arabic: string;
    insufficient: boolean;
    evidenceAnalysis?: any[];
    finalResearchAssessment?: any;
  }> {
    if (!passages || passages.length === 0) {
      return {
        summary: 'دستیاب مصادر میں اس سوال کے لیے واضح اور قابلِ اعتماد عبارت نہیں مل سکی۔',
        detail: `### جواب
دستیاب کلاسیکی مصادر میں اس مخصوص سوال کے لیے صریح عبارت نہیں مل سکی۔

### مصادر و مراجع
تلاش کے دائرے میں شامل کتب سے اس عنوان کے تحت براہِ راست عبارت دستیاب نہیں ہوئی۔ براہِ کرم الفاظ میں تبدیلی کر کے یا کتب کا دائرہ کار وسیع کر کے دوبارہ کوشش فرمائیں۔`,
        istidlal_arabic: '',
        insufficient: true,
      };
    }

    const ai = this.getAiClient(overrideKey);

    const passagesFormatted = passages
      .map(
        (p, idx) => `
[مصدر ${idx + 1}]
الكتاب: ${p.book}
المؤلف: ${p.author}
المكان: ${p.locator}
الرابط: ${p.url}
الفئة/المذهب: ${p.category_id === '14' ? 'الفقه الحنفي' : p.category_id === '16' ? 'الفقه الشافعي' : p.category_id === '15' ? 'الفقه المالكي' : p.category_id === '17' ? 'الفقه الحنبلي' : 'عام / أصول / حديث'}
النص العربي الأصلي:
"""
${p.arabic_text}
"""
`
      )
      .join('\n-------------------\n');

    const systemInstruction = `You are a master Islamic jurist, research scholar, and bibliographer (فقہی و علمی تحقیقی معاون).
Analyze the user's question/request and write an authoritative, highly polished research report or document in Urdu based STRICTLY AND EXCLUSIVELY on the retrieved classical Arabic source passages ([مصدر 1], [مصدر 2], etc.) and the previous conversation history.

========================================================
1. DEFAULT RESEARCH DEPTH — لازمی تفصیلی تحقیق (MANDATORY DEFAULT)
========================================================
- BY DEFAULT, for EVERY single question or request, you MUST perform comprehensive, full-depth research (Level 3 - Deep Research / مکمل فقہی تحقیق مع جزئیات). Do NOT provide a short or simple answer unless the user explicitly asks for "صرف ایک جملہ" or "مختصر ترین جواب".
- Your main "detail" text must ALWAYS contain a detailed juristic explanation (فقہی وضاحت) and multiple numbered or heading-based branch rulings (جزئیات) mapped directly from the retrieved passages.

========================================================
2. DETAILED BRANCH RULING STRUCTURE (جزئیات کا مستقل ڈھانچہ)
========================================================
For EVERY major juristic detail (جزئیہ) or retrieved passage, you MUST include it in the "detail" text rendered with this exact, highly readable structure:

#### [نام یا نمبر جزئیہ]
[فقہی جزئیہ کی تفصیلی علمی وضاحت اردو میں]

> [اصل عربی عبارت لفظ بہ لفظ، بغیر کسی تبدیلی کے]

**ترجمہ:** [اس عربی عبارت کا سلیس، فقہی اعتبار سے درست اور واضح اردو ترجمہ۔ مشینی ترجمہ ہرگز نہ ہو اور اصطلاحات کا مفہوم قائم رہے]

**حوالہ:** [کتاب کا نام]، [مصنف]، [جلد/صفحہ/مقام]
[تراث میں ماخذ دیکھیں](URL)

- NEVER skip this structure for any of the retrieved passages. Every retrieved source passage is extremely valuable and must be fully laid out as a distinct "جزئیہ" (branch ruling/detail) inside the "detail" response.

========================================================
3. ADAPTIVE LEVEL OVERRIDES (صرف فرمائش پر)
========================================================
Only override the default Level 3 depth if requested:
- If they ask for claim verification of a custom text, do Claim-by-Claim Verification (Level 4).
- If they request long-form writing like a column (کالم)، essay (مضمون)، speech (بیان/تقریر), transform the content into that specific genre (Level 5) while preserving all the verified source citations.

========================================================
4. CONVERSATION MEMORY / CONTEXT RESOLUTION (ربط باق الکلام)
========================================================
Maintain continuous conversation memory. When answering follow-ups, resolve pronouns and context clues automatically:
- "اس کی جزئیات بیان کریں" -> locate the main topic of the previous message and provide its details.
- "ان شرائط کی جزئیات بیان کریں" -> identify the list of conditions from the previous turn and detail them.
- "اس کے علاوہ جو جزئیات ہیں وہ بتائیں" -> exclude all details already shown in previous turns, and present only the remaining details from the passages.
- "اسی کو کالم بنا دیں" / "اسے تقریر میں تبدیل کریں" -> transform the existing research context into the requested literary format without resetting or ignoring the previously verified data.

========================================================
5. SCHOLARLY INTEGRITY & NO FORCED CITATIONS (علمی دیانت داری)
========================================================
- Do NOT generate fake Arabic text, fake page numbers, fake volumes, or fake URLs.
- If a claim or book is not in the source passages, say clearly: \`"اس دعوے کا واضح ماخذ دستیاب مصادر میں نہیں ملا۔"\` and do not generate a citation link for it.
- Never leave any Arabic quotation without its Urdu translation.
- Never begin the response with technical search logs or search metadata (e.g. "Nusus", "Turath", "Reranker", "Score"). Start DIRECTLY with the answer!

========================================================
6. MANDATORY CLICKABLE CITATION NUMBERS (سائٹیشن نمبرز [1]، [2] کا لازمی استعمال)
========================================================
- You MUST append bracketed numbers like [1], [2], [3], etc., after every key claim, book name, or quotation in your text (including inside the "حتمی شرعی حکم / خلاصہ" section, the "دلائل و وضاحت" section, and lists).
- These bracketed numbers must correspond EXACTLY to the source indices:
  - If a detail, book name, or quote comes from [مصدر 1], append [1] right after it.
  - If a detail, book name, or quote comes from [مصدر 2], append [2] right after it.
- This is CRITICAL because the frontend parses [1], [2], [3] into interactive, clickable buttons. If you only write the name of the book or plain numbers (like 1, 2, 3) without the square brackets, the user CANNOT click on them to open the original source in Turath!
- Example: "النفح الشذی [1] میں ذکر ہے کہ..." or "...کا ذکر صراحتاً موجود ہے [2]۔"

========================================================
7. SINGLE RESPONSE CONTAINER COMPATIBILITY
========================================================
Ensure all content is beautifully compiled inside this single text response. Use standard markdown headings, lists, bold text, blockquotes, and link tags \`[تراث میں ماخذ دیکھیں](URL)\`.

========================================================
8. COMPARATIVE FIQH MANDATE
========================================================
If the question asks for a comparison between different madhhabs (e.g. Hanafi vs Shafi'i):
### حنفی موقف
[Direct Hanafi answer & evidence]
### اصل عبارت
### ترجمہ
### حوالہ

### شافعی موقف
[Direct Shafi'i answer & evidence]
### اصل عبارت
### ترجمہ
### حوالہ

### اختلاف کی وضاحت
[Explanation of the points of agreement and disagreement]

========================================================
9. SCHOLARLY INTEGRITY & EVIDENCE ANALYSIS
========================================================
- Never invent citations, page numbers, authors, or Arabic quotes.
- Translate Arabic accurately into Urdu.
- For each passage under "evidenceAnalysis", identify:
  - its classified "evidence_role": rule, condition, qualification, exception, definition, restriction, cause, consequence, alternative, disagreement, supporting_evidence, opposing_evidence.
  - whether it directly "supports_claim" (boolean).
  - "confidence" score (float between 0 and 1).
- For "finalResearchAssessment", evaluate if the collected evidence was sufficient, list any missing required evidence (like missing conditions or excuses), list contradictions if any, and state whether more search is recommended.
- If evidence is insufficient, state clearly: "دستیاب مصادر میں اس سوال کے لیے واضح اور قابلِ اعتماد عبارت نہیں مل سکی۔" and set "insufficient": true.`;

    const prompt = `سوال (User Question):
"${userQuestion}"

المصادر العربية المستخرجة من تراث (Retrieved Arabic Classical Passages):
${passagesFormatted}

Analyze the passages and output the structured JSON response now.`;

    if (ai) {
      const candidateModels = Array.from(
        new Set(
          [
            process.env.AI_MODEL,
            'gemini-3.6-flash',
            'gemini-3.5-flash',
            'gemini-3.7-flash',
            'gemini-3.1-pro-preview',
            'gemini-3.1-flash-lite',
            'gemini-flash-latest',
          ]
            .filter(Boolean)
            .map((m) => (m!.startsWith('models/') ? m!.substring(7) : m!))
        )
      );

      for (const modelName of candidateModels) {
        try {
          const response = await callGeminiWithRetry(modelName, () =>
            ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    summary: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    istidlal_arabic: { type: Type.STRING },
                    insufficient: { type: Type.BOOLEAN },
                    evidenceAnalysis: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          claim: { type: Type.STRING },
                          source_id: { type: Type.STRING },
                          book: { type: Type.STRING },
                          author: { type: Type.STRING },
                          evidence_role: { type: Type.STRING },
                          supports_claim: { type: Type.BOOLEAN },
                          confidence: { type: Type.NUMBER }
                        }
                      }
                    },
                    finalResearchAssessment: {
                      type: Type.OBJECT,
                      properties: {
                        evidence_sufficient: { type: Type.BOOLEAN },
                        missing_evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                        contradictions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        needs_more_search: { type: Type.BOOLEAN }
                      }
                    }
                  }
                }
              },
            })
          );

          if (response.text) {
            const parsed = cleanAndParseJson(response.text);
            const isInsufficient = Boolean(parsed.insufficient);
            return {
              summary: isInsufficient
                ? 'دستیاب مصادر میں اس سوال کے لیے واضح اور قابلِ اعتماد عبارت نہیں مل سکی۔'
                : parsed.summary || 'جواب درپیش ہے۔',
              detail: parsed.detail || '',
              istidlal_arabic: isInsufficient ? '' : parsed.istidlal_arabic || '',
              insufficient: isInsufficient,
              evidenceAnalysis: parsed.evidenceAnalysis || [],
              finalResearchAssessment: parsed.finalResearchAssessment || null,
            };
          }
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
            console.warn(`[GeminiLLMProvider] synthesize model ${modelName} rate limited (429)`);
          } else {
            console.warn(`[GeminiLLMProvider] synthesize model ${modelName} failed:`, msg.split('\n')[0]);
          }
        }
      }
    }

    // Structured Fallback if AI call unavailable or rate limited
    const topPassage = passages[0];
    const summaryText = `جواب: ${topPassage.book} سے حاصل کردہ دلیل کی روشنی میں تفصیلی جائزہ درج ذیل ہے۔`;

    const fallbackDetail = passages
      .map(
        (p) => `### اصل عبارت
${p.arabic_text}

### ترجمہ
${p.arabic_text} (متنِ عربی از ${p.book})

### حوالہ
کتاب: ${p.book} | مصنف: ${p.author} | مقام: ${p.locator}`
      )
      .join('\n\n---\n\n');

    const fullDetail = `### جواب
دستیاب کلاسیکی مصادر کے مطالعہ سے حاصل شدہ نتائج درج ذیل ہیں:

### دلائل و وضاحت
استخراج کردہ عبارات کے مطابق اس مسئلے کی وضاحت ذیل کے مصادرِ اصل سے کی جاتی ہے:

${fallbackDetail}

### مصادر و مراجع
${passages.map((p) => `- ${p.book} (${p.author})`).join('\n')}`;

    return {
      summary: summaryText,
      detail: fullDetail,
      istidlal_arabic: topPassage?.arabic_text?.substring(0, 180) || '',
      insufficient: false,
    };
  }
}

export const llmProvider = new GeminiLLMProvider();
