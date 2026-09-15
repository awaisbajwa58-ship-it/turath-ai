import { GoogleGenAI } from '@google/genai';
import { SourceCitation, ResearchAnswer, ResearchMode } from '../src/types.js';
import { llmProvider } from './providers/llmProvider.js';

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

export async function synthesizeUrduResearchAnswer(
  userQuestion: string,
  passages: SourceCitation[],
  modeInfo?: { researchMode?: ResearchMode; isOpposingRequested?: boolean; isComparative?: boolean },
  apiKey?: string
): Promise<{ answer: ResearchAnswer; modelsAttempted: string[] }> {
  if (!passages || passages.length === 0) {
    return {
      answer: {
        summary: 'دستیاب مصادر میں اس سوال کے لیے واضح اور قابلِ اعتماد عبارت نہیں مل سکی۔',
        detail: `### جواب
دستیاب کلاسیکی مصادر میں اس مخصوص سوال کے لیے صریح عبارت نہیں مل سکی۔

### مصادر و مراجع
تلاش کے دائرے میں شامل کتب سے اس عنوان کے تحت براہِ راست عبارت دستیاب نہیں ہوئی۔ براہِ کرم الفاظ میں تبدیلی کر کے یا کتب کا دائرہ کار وسیع کر کے دوبارہ کوشش فرمائیں۔`,
        istidlal_arabic: '',
        insufficient: true,
      },
      modelsAttempted: [],
    };
  }

  const modelsAttempted: string[] = ['gemini-3.6-flash'];

  try {
    const result = await llmProvider.synthesizeAnswer(userQuestion, passages, modeInfo?.isComparative, apiKey);
    if (result) {
      return {
        answer: {
          summary: result.summary,
          detail: result.detail,
          istidlal_arabic: result.istidlal_arabic,
          insufficient: result.insufficient,
          evidenceAnalysis: result.evidenceAnalysis,
          finalResearchAssessment: result.finalResearchAssessment,
        },
        modelsAttempted,
      };
    }
  } catch (err: any) {
    console.warn(`[aiService] llmProvider synthesis failed:`, err?.message || err);
  }

  // Fallback structured generation if AI API is rate limited or fails
  const topPassage = passages[0];
  const summaryText = `جواب: ${topPassage.book} سے حاصل کردہ دلیل کی روشنی میں تفصیلی جائزہ درج ذیل ہے۔`;

  const fallbackDetail = passages
    .map(
      (p) => `### اصل عبارت
${p.arabic_text}

### ترجمہ
ترجمہ اس وقت دستیاب نہیں ہے۔ اصل عربی عبارت اوپر درج ہے۔

### حوالہ
کتاب: ${p.book}
مصنف: ${p.author}
مقام: ${p.locator}
لنک: ${p.url}`
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
    answer: {
      summary: summaryText,
      detail: fullDetail,
      istidlal_arabic: topPassage?.arabic_text?.substring(0, 180) || '',
      insufficient: false,
    },
    modelsAttempted,
  };
}
