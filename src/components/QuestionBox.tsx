import React, { useState } from 'react';
import { Search, HelpCircle, ArrowLeft } from 'lucide-react';
import { QuickQuestion } from '../types.js';

interface QuestionBoxProps {
  onSubmitQuestion: (question: string) => void;
  isLoading: boolean;
}

const SAMPLE_QUESTIONS: QuickQuestion[] = [
  {
    title: 'اصول فقہ',
    question: 'اصول فقہ میں اجماع کی حجیت اور اس کی شرائط کیا ہیں؟',
    category: 'usul',
  },
  {
    title: 'فقہ حنفی',
    question: 'وضو کے کتنے فرائض ہیں؟',
    category: 'hanafi',
  },
  {
    title: 'مقارن تحقیق',
    question: 'حنفی اور شافعیہ کے نزدیک اس مسئلے کا کیا حکم ہے؟',
    category: 'all',
  },
  {
    title: 'استدلال و نصوص',
    question: 'ایسی عبارات تلاش کریں جن سے معلوم ہو کہ اجماع شرعی حجت ہے',
    category: 'usul',
  },
];

export const QuestionBox: React.FC<QuestionBoxProps> = ({
  onSubmitQuestion,
  isLoading,
}) => {
  const [questionText, setQuestionText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || isLoading) return;
    onSubmitQuestion(questionText.trim());
  };

  const handleSelectSample = (sampleText: string) => {
    setQuestionText(sampleText);
    onSubmitQuestion(sampleText);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-6 mb-6">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="urdu-question"
            className="block text-sm font-bold text-slate-900 font-urdu"
          >
            اپنا فقہی یا تحقیقی سوال درج کریں:
          </label>
          <span className="text-xs text-slate-500 font-urdu">زبان: اردو / عربی</span>
        </div>

        <div className="relative mb-4">
          <textarea
            id="urdu-question"
            rows={4}
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            disabled={isLoading}
            placeholder="اپنا شرعی، فقہی یا تحقیقی سوال تفصیل سے تحریر فرمائیں (مثال: اصول فقہ میں اجماع کی حجیت اور اس کی شرائط کیا ہیں؟)"
            className="w-full rounded-xl border border-slate-300 p-3.5 text-base sm:text-lg font-urdu text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 outline-none transition-all resize-none shadow-inner bg-slate-50/50 disabled:opacity-60"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
          <button
            type="submit"
            disabled={!questionText.trim() || isLoading}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-900 hover:bg-emerald-950 active:bg-black text-amber-100 font-bold text-base font-urdu shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-950"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                <span>کتب میں تلاش جاری ہے...</span>
              </>
            ) : (
              <>
                <Search className="w-5 h-5 text-amber-300" />
                <span>تحقیق کریں</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Quick sample questions */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2.5">
          <HelpCircle className="w-3.5 h-3.5 text-emerald-700" />
          <span>نمونہ سوالات (کلک کر کے تحقیق فرمائیں):</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSelectSample(sample.question)}
              className="text-xs sm:text-sm font-urdu px-3 py-1.5 rounded-lg bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-900 border border-emerald-200/80 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span className="font-bold text-emerald-950">[{sample.title}]:</span>
              <span>{sample.question}</span>
              <ArrowLeft className="w-3 h-3 text-emerald-600 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
