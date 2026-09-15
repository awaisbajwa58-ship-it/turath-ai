import React, { useState, useEffect } from 'react';
import { BookOpen, Search, Sparkles, Filter, FileCheck, Layers } from 'lucide-react';

const PROGRESS_STEPS = [
  {
    title: 'سوال کا تجزیہ اور عربی مصطلحات کی تیاری...',
    subtitle: 'سوال کے مقصد کی شناخت اور علمی عربی الفاظ کا استخراج',
    icon: Search,
  },
  {
    title: 'تراث اور نصوص کی کتب میں تلاش جاری ہے...',
    subtitle: 'Nusus اور Turath.io کی کتب سے اصل عبارات کی بازیافت',
    icon: BookOpen,
  },
  {
    title: 'متعلقہ صریح عبارات کا انتخاب و ترجیح...',
    subtitle: 'موضوع سے مطابقت رکھنے والی عبارات کی سائنسی چھان بین',
    icon: Filter,
  },
  {
    title: 'شرعی حکم، نصوص اور تفصیل کی تدوین...',
    subtitle: 'محلِ استدلال کی نشان دہی اور تفصیلی اردو خلاصہ کی تشکیل',
    icon: FileCheck,
  },
];

export const LoadingState: React.FC = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < PROGRESS_STEPS.length - 1 ? prev + 1 : prev));
    }, 2800);

    return () => clearInterval(timer);
  }, []);

  const activeStep = PROGRESS_STEPS[currentStepIndex];
  const StepIcon = activeStep.icon;

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 p-6 sm:p-8 text-center shadow-sm my-6">
      <div className="relative inline-block mb-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 animate-pulse mx-auto">
          <BookOpen className="w-8 h-8 text-emerald-800" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center animate-spin">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
      </div>

      <h3 className="text-xl font-bold font-urdu text-emerald-900 mb-1.5 transition-all">
        {activeStep.title}
      </h3>

      <p className="text-sm font-urdu text-slate-600 max-w-md mx-auto mb-6">
        {activeStep.subtitle}
      </p>

      {/* Progressive Steps Indicator */}
      <div className="space-y-2 max-w-md mx-auto text-xs font-urdu">
        {PROGRESS_STEPS.map((step, idx) => {
          const isDone = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          const IconComponent = step.icon;

          return (
            <div
              key={idx}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl transition-all duration-300 ${
                isCurrent
                  ? 'bg-emerald-800 text-amber-100 font-bold shadow-xs border border-emerald-900 scale-[1.02]'
                  : isDone
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-100'
                  : 'bg-slate-100/60 text-slate-400 border border-slate-200/50 opacity-60'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold ${
                  isCurrent
                    ? 'bg-amber-400 text-amber-950 animate-pulse'
                    : isDone
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isDone ? '✓' : idx + 1}
              </div>
              <span className="flex-1 text-right">{step.title}</span>
              <IconComponent className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-amber-300' : ''}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
