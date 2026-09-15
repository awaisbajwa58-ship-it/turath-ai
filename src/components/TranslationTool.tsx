import React, { useState, useEffect } from 'react';
import { Languages, Copy, Check, Loader2, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';

interface TranslationToolProps {
  initialText?: string;
  onRequestApiKey?: () => void;
}

export const TranslationTool: React.FC<TranslationToolProps> = ({ initialText = '', onRequestApiKey }) => {
  const [inputText, setInputText] = useState<string>(initialText);
  const [translatedText, setTranslatedText] = useState<string>('');
  const [style, setStyle] = useState<'balanced' | 'literal' | 'idiomatic'>('balanced');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (initialText) {
      setInputText(initialText);
    }
  }, [initialText]);

  const handleTranslate = async () => {
    if (!inputText.trim()) return;

    setIsTranslating(true);
    setError(null);
    setTranslatedText('');

    try {
      const userApiKey = localStorage.getItem('nusus_gemini_api_key') || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (userApiKey) {
        headers['x-gemini-api-key'] = userApiKey;
      }

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: inputText.trim(),
          style,
          apiKey: userApiKey || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requiresApiKey && onRequestApiKey) {
          onRequestApiKey();
        }
        throw new Error(data.error || 'ترجمے کے دوران کلاؤڈ سرور سے رابطہ نہیں ہو سکا۔');
      }

      if (data.translation) {
        setTranslatedText(data.translation);
      } else {
        setTranslatedText('ترجمہ مکمل نہیں ہو سکا، براہ کرم متبادل عبارت کے ساتھ دوبارہ کوشش کریں۔');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'ترجمہ کرنے کے دوران کوئی خرابی پیش آئی۔');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setInputText('');
    setTranslatedText('');
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 font-urdu p-4 text-right dir-rtl select-text">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-4">
        
        {/* Explanation banner */}
        <div className="bg-emerald-950/5 border border-emerald-900/10 rounded-2xl p-4 flex gap-3 items-start">
          <Languages className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-emerald-950">علمی و فقہی ترجمہ کار (Technical Translator)</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              کسی بھی عربی عبارت، فقہی جزئیہ یا کلاسیکی کتابی اقتباس کو یہاں چسپاں کریں اور اس کا بامحاورہ، علمی اور فقہی اردو ترجمہ حاصل کریں۔ یہ نظام اصطلاحی معانی (Technical Juristic Terms) کا خاص خیال رکھتے ہوئے ترجمہ پیش کرتا ہے۔
            </p>
          </div>
        </div>

        {/* Translation Workspaces */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
          
          {/* Input Box Column */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs flex flex-col min-h-0 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
              <span className="text-xs font-bold text-slate-700">اصل عربی عبارت چسپاں کریں:</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[10px] text-red-700 hover:text-red-950 font-bold"
                disabled={isTranslating}
              >
                عبارت صاف کریں
              </button>
            </div>

            {/* Input Text Box */}
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="یہاں اصل عربی عبارت لکھیں یا کتاب سے کاپی کر کے چسپاں کریں..."
              className="flex-1 w-full bg-slate-50/50 text-sm border border-slate-200/70 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-emerald-800 font-arabic leading-loose text-slate-800 text-justify text-right select-text resize-none"
              style={{ minHeight: '150px' }}
              disabled={isTranslating}
            />

            {/* Translation Styles selection */}
            <div className="space-y-1.5 shrink-0 pt-2">
              <span className="text-xs font-bold text-slate-600 block">ترجمے کا علمی اسلوب منتخب کریں:</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStyle('balanced')}
                  className={`py-2 px-1 text-[11px] rounded-xl font-bold border transition-all cursor-pointer ${
                    style === 'balanced'
                      ? 'bg-emerald-900 border-emerald-950 text-amber-50'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  علمی و فقہی ترجمہ
                </button>
                <button
                  type="button"
                  onClick={() => setStyle('idiomatic')}
                  className={`py-2 px-1 text-[11px] rounded-xl font-bold border transition-all cursor-pointer ${
                    style === 'idiomatic'
                      ? 'bg-emerald-900 border-emerald-950 text-amber-50'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  بامحاورہ ادبی
                </button>
                <button
                  type="button"
                  onClick={() => setStyle('literal')}
                  className={`py-2 px-1 text-[11px] rounded-xl font-bold border transition-all cursor-pointer ${
                    style === 'literal'
                      ? 'bg-emerald-900 border-emerald-950 text-amber-50'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  لفظی ترجمہ
                </button>
              </div>
            </div>

            {/* Action submit button */}
            <button
              onClick={handleTranslate}
              disabled={isTranslating || !inputText.trim()}
              className="w-full py-2.5 rounded-xl bg-emerald-900 hover:bg-emerald-950 text-amber-50 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>علمی ترجمہ جاری ہے...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>اردو ترجمہ حاصل کریں</span>
                </>
              )}
            </button>
          </div>

          {/* Output Box Column */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs flex flex-col min-h-0 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
              <span className="text-xs font-bold text-slate-700">ترجمہ شدہ اردو عبارت:</span>
              
              {translatedText && (
                <button
                  onClick={handleCopy}
                  className="text-[10px] text-emerald-800 hover:text-emerald-950 font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-800" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'ترجمہ کاپی ہو گیا' : 'ترجمہ کاپی کریں'}</span>
                </button>
              )}
            </div>

            {/* Response area */}
            {isTranslating ? (
              <div className="flex-1 flex flex-col justify-center items-center space-y-2">
                <Loader2 className="w-7 h-7 text-emerald-800 animate-spin" />
                <p className="text-xs text-slate-400 font-bold">جملوں کی فصاحت کا تجزیہ کیا جا رہا ہے...</p>
              </div>
            ) : error ? (
              <div className="flex-1 flex flex-col justify-center items-center py-6 text-center space-y-2">
                <AlertCircle className="w-6 h-6 text-red-600" />
                <p className="text-xs text-slate-600 font-bold">{error}</p>
                <button
                  onClick={handleTranslate}
                  className="text-[10px] text-emerald-800 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>دوبارہ کوشش کریں</span>
                </button>
              </div>
            ) : translatedText ? (
              <div className="flex-1 overflow-y-auto text-sm text-slate-800 font-urdu leading-relaxed whitespace-pre-wrap select-text text-justify pr-1 font-medium select-text">
                {translatedText}
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-center items-center text-slate-300 text-center space-y-1.5 p-6 border border-dashed border-slate-100 rounded-xl bg-slate-50/30">
                <Languages className="w-6 h-6 text-slate-300" />
                <p className="text-[11px] font-bold text-slate-400">ترجمے کا انتظار ہے...</p>
                <p className="text-[10px] text-slate-400 max-w-[200px]">
                  عربی عبارت چسپاں کر کے ترجمہ حاصل کرنے کے بٹن پر کلک کریں۔
                </p>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
