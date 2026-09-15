import React, { useState } from 'react';
import { Key, CheckCircle, AlertCircle, Loader2, ExternalLink, X, ShieldCheck, Trash2 } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  onSaveKey: (key: string) => void;
  onRemoveKey: () => void;
  isDevMode: boolean;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentKey,
  onSaveKey,
  onRemoveKey,
  isDevMode,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState(currentKey || '');
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleValidateAndSave = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setErrorMessage('براہ کرم اپنی Gemini API Key درج کریں۔');
      setValidationStatus('invalid');
      return;
    }

    setIsValidating(true);
    setValidationStatus('idle');
    setErrorMessage('');

    try {
      let isValid = false;
      let errorMsg = '';

      // First attempt: Backend validation
      try {
        const res = await fetch('/api/config/validate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: trimmed }),
        });

        if (res.ok) {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            if (data.valid) {
              isValid = true;
            } else {
              errorMsg = data.error || 'درج کردہ API Key درست نہیں ہے۔ براہ کرم تصدیق کریں۔';
            }
          } catch {
            // Non-JSON response, fall through to Google direct check
          }
        }
      } catch {
        // Backend offline / network issue, proceed to direct check
      }

      // Second attempt (Fallback): Direct client-side Google AI Studio validation
      if (!isValid && !errorMsg) {
        try {
          const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${trimmed}`);
          if (gRes.ok) {
            isValid = true;
          } else {
            const gText = await gRes.text();
            try {
              const gData = JSON.parse(gText);
              errorMsg = gData?.error?.message || 'درج کردہ API Key درست نہیں ہے۔ براہ کرم تصدیق کریں۔';
            } catch {
              errorMsg = 'درج کردہ API Key درست نہیں ہے۔';
            }
          }
        } catch {
          errorMsg = 'انٹرنیٹ یا گوگل سروس سے رابطہ قائم نہیں ہو سکا۔';
        }
      }

      if (isValid) {
        setValidationStatus('valid');
        onSaveKey(trimmed);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setValidationStatus('invalid');
        setErrorMessage(errorMsg || 'درج کردہ API Key درست نہیں ہے۔ براہ کرم تصدیق کریں۔');
      }
    } catch (err: any) {
      setValidationStatus('invalid');
      setErrorMessage(err?.message || 'تصدیق کے دوران سرور سے رابطہ نہیں ہو سکا۔');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemove = () => {
    onRemoveKey();
    setApiKeyInput('');
    setValidationStatus('idle');
    setErrorMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-emerald-100/60 font-sans"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Key className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Gemini API Key سیٹنگز</h3>
              <p className="text-xs text-emerald-100/80">
                {isDevMode ? 'AI Studio ڈیولپر ماحول فعال ہے' : 'پبلک ریسرچ ماحول'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="بند کریں"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {isDevMode ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Google AI Studio موڈ فعال ہے</span>
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed">
                آپ اس وقت ڈویلپمنٹ ماحول میں کام کر رہے ہیں۔ سسٹم میں پہلے سے منسلک Gemini API کنفیگریشن خودکار طور پر استعمال ہو رہی ہے اور آپ کو دستی کی درج کرنے کی ضرورت نہیں ہے۔
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50/70 border border-emerald-200/80 p-3.5 rounded-xl text-xs text-emerald-950 leading-relaxed">
                <p className="font-bold mb-1 text-emerald-900">🔹 اہم رہنمائی:</p>
                <p>
                  <strong>تراث اے آئی (Turath AI)</strong> کے تحقیقی، تفسیری اور ترجماتی ماڈلز چلانے کے لیے ہر صارف کی اپنی <strong>مفت Gemini API Key</strong> درکار ہے۔ یہ کلید صرف آپ کے اپنے براؤزر کے مقامی اسٹوریج میں محفوظ رہے گی اور سرور پر کبھی بھی اسٹور نہیں کی جاتی۔
                </p>
              </div>

              {/* Step by step guide */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs space-y-1.5 text-slate-700 font-urdu">
                <p className="font-bold text-slate-900">مفت API Key حاصل کرنے کا طریقہ:</p>
                <ol className="list-decimal list-inside space-y-1 mr-1 text-[11px] text-slate-600 leading-relaxed">
                  <li>نیچے دیے گئے لنک سے Google AI Studio کھولیں اور لاگ ان کریں۔</li>
                  <li><strong>Create API Key</strong> پر کلک کر کے نئی کلید بنائیں۔</li>
                  <li>کلید کو کاپی کر کے نیچے باکس میں پیسٹ کریں اور 'محفوظ کریں' دبائیں۔</li>
                </ol>
                <div className="pt-1 flex justify-end">
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-amber-100 text-xs font-bold transition-all shadow-2xs"
                  >
                    <span>Google AI Studio سے مفت کلید حاصل کریں</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 font-urdu">
                  Gemini API Key درج کریں:
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setValidationStatus('idle');
                      setErrorMessage('');
                    }}
                    placeholder="AIzaSy..."
                    dir="ltr"
                    className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-hidden font-mono transition-all text-left placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Validation Status / Error */}
              {validationStatus === 'valid' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-semibold font-urdu">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>API Key کی کامیابی سے تصدیق ہو گئی اور سسٹم فعال ہو گیا!</span>
                </div>
              )}

              {validationStatus === 'invalid' && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs font-semibold font-urdu">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
            {!isDevMode && currentKey ? (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3.5 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                کی ختم کریں
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                بند کریں
              </button>

              {!isDevMode && (
                <button
                  type="button"
                  onClick={handleValidateAndSave}
                  disabled={isValidating || !apiKeyInput.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      تصدیق ہو رہی ہے...
                    </>
                  ) : (
                    'محفوظ اور تصدیق کریں'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
