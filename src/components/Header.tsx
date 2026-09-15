import React from 'react';
import { Scale } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-emerald-950 text-amber-50 border-b border-emerald-800/80 shadow-sm py-4 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner shrink-0">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-urdu text-amber-200 flex items-center gap-2">
              <span>تراث اے آئی</span>
              <span className="text-xs font-normal text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-400/30">Turath AI</span>
            </h1>
            <p className="text-xs text-emerald-200/90 font-urdu mt-0.5">
              کلاسیکی اسلامی کتب و فتاویٰ کے ذخیرے سے سمارٹ فقہی و علمی معاون
            </p>
          </div>
        </div>

        {/* Application Credit */}
        <div className="text-xs font-urdu text-amber-300 bg-emerald-900/90 px-3.5 py-1.5 rounded-lg border border-amber-500/30 font-semibold shadow-sm">
          تیارکردہ: مفتی محمد اویس باجوہ
        </div>
      </div>
    </header>
  );
};
