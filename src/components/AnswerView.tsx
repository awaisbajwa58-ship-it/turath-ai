import React, { useState } from 'react';
import { ResearchResponse, SourceCitation } from '../types.js';
import {
  CheckCircle2,
  FileText,
  BookOpen,
  ExternalLink,
  AlertTriangle,
  Bookmark,
  Quote,
  ShieldCheck,
  Copy,
  Check,
  Sparkles,
  Award,
  X,
} from 'lucide-react';

interface ParsedSection {
  title: string;
  content: string;
}

function parseMarkdownSections(text: string): ParsedSection[] {
  if (!text) return [];
  const normalizedText = text.trim();
  
  // Find all matches of "^### Title" on newlines or start of string
  const sectionRegex = /^###\s+([^\n]+)/gm;
  const sections: ParsedSection[] = [];
  
  const headerPositions: { title: string; index: number }[] = [];
  let match;
  while ((match = sectionRegex.exec(normalizedText)) !== null) {
    headerPositions.push({
      title: match[1].trim(),
      index: match.index
    });
  }
  
  if (headerPositions.length === 0) {
    return [{ title: 'تفصيل', content: normalizedText }];
  }
  
  for (let i = 0; i < headerPositions.length; i++) {
    const current = headerPositions[i];
    const next = headerPositions[i + 1];
    
    const contentStart = current.index + `### ${current.title}`.length;
    const contentEnd = next ? next.index : normalizedText.length;
    
    let content = normalizedText.substring(contentStart, contentEnd).trim();
    content = content.replace(/^\r?\n+/, '').trim();
    
    sections.push({
      title: current.title,
      content
    });
  }
  
  return sections;
}

const parseBoldText = (sub: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*(.*?)\*\*/g;
  let boldMatch;
  let curr = 0;
  
  while ((boldMatch = boldRegex.exec(sub)) !== null) {
    const idx = boldMatch.index;
    if (idx > curr) {
      parts.push(sub.substring(curr, idx));
    }
    parts.push(
      <strong key={`bold-${idx}`} className="font-bold text-slate-900">
        {boldMatch[1]}
      </strong>
    );
    curr = boldRegex.lastIndex;
  }
  
  if (curr < sub.length) {
    parts.push(sub.substring(curr));
  }
  return parts;
};

const parseBoldAndLinks = (sub: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch;
  let curr = 0;
  
  while ((linkMatch = linkRegex.exec(sub)) !== null) {
    const idx = linkMatch.index;
    if (idx > curr) {
      const plainText = sub.substring(curr, idx);
      parts.push(...parseBoldText(plainText));
    }
    
    const linkText = linkMatch[1];
    const url = linkMatch[2];
    
    parts.push(
      <a
        key={`link-${idx}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 hover:text-emerald-950 border border-emerald-200/50 hover:border-emerald-300/80 font-bold transition-all text-xs my-1 mx-1 cursor-pointer shadow-3xs font-urdu"
      >
        <BookOpen className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
        <span>{linkText}</span>
        <ExternalLink className="w-3 h-3 text-emerald-600/70" />
      </a>
    );
    
    curr = linkRegex.lastIndex;
  }
  
  if (curr < sub.length) {
    parts.push(...parseBoldText(sub.substring(curr)));
  }
  
  return parts;
};

const parseTextWithCitations = (text: string, onCitationClick?: (num: number) => void) => {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  const regex = /\[(\d+)\]/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    const citationNumber = parseInt(match[1], 10);
    
    if (matchIndex > currentIndex) {
      const precedingText = text.substring(currentIndex, matchIndex);
      parts.push(...parseBoldAndLinks(precedingText));
    }
    
    if (onCitationClick) {
      parts.push(
        <button
          key={`cite-${matchIndex}`}
          onClick={() => onCitationClick(citationNumber)}
          className="mx-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-200/80 text-[11px] font-sans font-bold cursor-pointer inline-flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-2xs"
          title={`حوالہ ${citationNumber} پر جائیں`}
        >
          [{citationNumber}]
        </button>
      );
    } else {
      parts.push(match[0]);
    }
    
    currentIndex = regex.lastIndex;
  }
  
  if (currentIndex < text.length) {
    parts.push(...parseBoldAndLinks(text.substring(currentIndex)));
  }
  
  return parts;
};

const renderFormattedContent = (content: string, onCitationClick?: (num: number) => void) => {
  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  
  let inBlockquote = false;
  let blockquoteLines: string[] = [];
  
  const flushBlockquote = (key: string | number) => {
    if (blockquoteLines.length > 0) {
      const text = blockquoteLines.join('\n');
      renderedElements.push(
        <blockquote
          key={`bq-${key}`}
          className="pr-4 border-r-4 border-amber-400 font-arabic text-base sm:text-lg text-slate-800 font-semibold leading-loose text-right my-3 whitespace-pre-line py-1 bg-amber-50/10"
        >
          {parseTextWithCitations(text, onCitationClick)}
        </blockquote>
      );
      blockquoteLines = [];
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();
    
    // Handle empty lines
    if (!trimmed) {
      if (inBlockquote) {
        blockquoteLines.push('');
      } else {
        renderedElements.push(<div key={`empty-${idx}`} className="h-2" />);
      }
      continue;
    }
    
    // Check blockquote (starts with >)
    if (trimmed.startsWith('>')) {
      inBlockquote = true;
      const quoteText = trimmed.substring(1).trim();
      blockquoteLines.push(quoteText);
      continue;
    } else if (inBlockquote) {
      inBlockquote = false;
      flushBlockquote(idx);
    }
    
    // Check H3 (###)
    if (trimmed.startsWith('### ')) {
      const headingText = trimmed.substring(4).trim();
      renderedElements.push(
        <h3
          key={`h3-${idx}`}
          className="text-sm sm:text-base font-extrabold text-emerald-900 mt-5 mb-2 font-urdu border-r-2 border-emerald-800 pr-2"
        >
          {parseTextWithCitations(headingText, onCitationClick)}
        </h3>
      );
      continue;
    }
    
    // Check H4 (####)
    if (trimmed.startsWith('#### ')) {
      const headingText = trimmed.substring(5).trim();
      renderedElements.push(
        <h4
          key={`h4-${idx}`}
          className="text-xs sm:text-sm font-bold text-emerald-800 mt-4 mb-1 font-urdu"
        >
          {parseTextWithCitations(headingText, onCitationClick)}
        </h4>
      );
      continue;
    }
    
    // Bullet list item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.substring(2);
      renderedElements.push(
        <div key={`bullet-${idx}`} className="flex items-start gap-2 mr-3 my-1 text-right dir-rtl font-urdu">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-700 mt-2.5 shrink-0" />
          <p className="flex-1 text-slate-700 leading-loose text-sm sm:text-base">
            {parseTextWithCitations(itemText, onCitationClick)}
          </p>
        </div>
      );
      continue;
    }
    
    // Numbered list item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      const num = numMatch[1];
      const itemText = numMatch[2];
      renderedElements.push(
        <div key={`num-${idx}`} className="flex items-start gap-2 mr-3 my-1 text-right dir-rtl font-urdu">
          <span className="text-emerald-800 font-bold ml-1 text-sm sm:text-base">{num}.</span>
          <p className="flex-1 text-slate-700 leading-loose text-sm sm:text-base">
            {parseTextWithCitations(itemText, onCitationClick)}
          </p>
        </div>
      );
      continue;
    }
    
    // Regular paragraph
    renderedElements.push(
      <p
        key={`p-${idx}`}
        className="text-slate-700 text-sm sm:text-base font-urdu leading-loose text-right dir-rtl my-1.5"
      >
        {parseTextWithCitations(trimmed, onCitationClick)}
      </p>
    );
  }
  
  // Flush any remaining blockquote
  if (blockquoteLines.length > 0) {
    flushBlockquote('final');
  }
  
  return <div className="space-y-1.5 text-right dir-rtl">{renderedElements}</div>;
};

const sanitizeScholarlyText = (text: string): string => {
  if (!text) return '';
  return text
    .split('\n')
    .filter((line) => {
      const lower = line.toLowerCase();
      if (
        lower.includes('json') &&
        (lower.includes('format') ||
          lower.includes('output') ||
          lower.includes('strictly') ||
          lower.includes('schema') ||
          lower.includes('conforming'))
      ) {
        return false;
      }
      if (
        lower.includes('system instruction') ||
        lower.includes('system prompt') ||
        lower.includes('user query') ||
        lower.includes('instruction:') ||
        lower.includes('control token') ||
        lower.includes('parameters')
      ) {
        return false;
      }
      return true;
    })
    .join('\n');
};

interface AnswerViewProps {
  data: ResearchResponse;
  onCitationClick?: (num: number) => void;
  onOpenBook?: (bookId: string, pageNumber: number) => void;
}

export const AnswerView: React.FC<AnswerViewProps> = ({ data, onCitationClick, onOpenBook }) => {
  const { answer: rawAnswer, sources, question } = data;
  
  const answer = {
    ...rawAnswer,
    summary: sanitizeScholarlyText(rawAnswer.summary || ''),
    detail: sanitizeScholarlyText(rawAnswer.detail || ''),
    istidlal_arabic: rawAnswer.istidlal_arabic ? sanitizeScholarlyText(rawAnswer.istidlal_arabic) : '',
  };

  const [copied, setCopied] = useState<boolean>(false);
  const [selectedCitation, setSelectedCitation] = useState<SourceCitation | null>(null);

  const handleCopyFullAnswer = () => {
    const textToCopy = `سوال: ${question}
 
حکم / خلاصہ:
${answer.summary}
 
${answer.istidlal_arabic ? `محلِ استدلال / خاص عربی نص:\n"${answer.istidlal_arabic}"\n\n` : ''}تفصیل:
${answer.detail}
 
المصادر:
${sources
  .map(
    (s, i) =>
      `${i + 1}. ${s.book} - ${s.author} (${s.locator})\nرابط: ${s.url}`
  )
  .join('\n')}`;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const localOnCitationClick = (citationNumber: number) => {
    if (sources && sources[citationNumber - 1]) {
      setSelectedCitation(sources[citationNumber - 1]);
    }
  };

  // Combine all parts into a single continuous markdown/text string to render as one continuous chat message
  const constructUnifiedText = () => {
    if (answer.insufficient) {
      return '';
    }
    
    let parts: string[] = [];
    
    if (answer.summary) {
      parts.push(`### حتمی شرعی حکم / خلاصہ\n${answer.summary}`);
    }
    
    if (answer.istidlal_arabic) {
      parts.push(`### اصل عربی عبارت / محلِ استدلال\n> ${answer.istidlal_arabic}`);
    }
    
    if (answer.detail) {
      parts.push(answer.detail);
    }
    
    return parts.join('\n\n');
  };

  return (
    <div className="font-urdu text-right dir-rtl leading-relaxed text-slate-800 relative">
      
      {/* Concise ruling / warning notice if insufficient */}
      {answer.insufficient ? (
        <div className="flex items-start gap-3 text-amber-900 bg-amber-50/70 p-4 rounded-xl border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-1" />
          <div className="space-y-1">
            <p className="font-bold text-sm sm:text-base text-amber-950">
              {answer.summary}
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">
              موجودہ تلاش میں حاصل کردہ عربی عبارات میں اس سوال کا صریح یا کافی جواب نہیں مل سکا۔ فتویٰ و عمل میں احتیاط کے پیشِ نظر دیگر الفاظ یا مصدر کے انتخاب سے دوبارہ تلاش کریں۔
            </p>
          </div>
        </div>
      ) : (
        // Render the entire response as a single continuous ChatGPT-style chat message
        <div className="space-y-3">
          {renderFormattedContent(constructUnifiedText(), localOnCitationClick)}
        </div>
      )}

      {/* 4. Compact Footer Toolbar with Copy Full Answer and disclaimer */}
      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <button
          onClick={handleCopyFullAnswer}
          className="px-3 py-1.5 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-800 flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer shadow-3xs"
          title="مکمل جواب مع حوالہ جات کاپی کریں"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700 font-bold">مکمل جواب کاپی ہو گیا!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>جواب کاپی کریں</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-300" />
          <span>کلاسیکی کتب سے ماخوذ تحقیقی معاونت۔ فتویٰ کے لیے علماء سے رجوع کریں۔</span>
        </div>
      </div>

      {/* 5. Beautiful Compact Citation Popup / Dialog Overlay (NotebookLM style) */}
      {selectedCitation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-urdu">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-emerald-900 text-amber-50 px-4 py-3 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCitation(null)}
                className="text-amber-100 hover:text-white p-1 rounded-lg hover:bg-emerald-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h4 className="text-sm sm:text-base font-bold flex items-center gap-1.5">
                <Bookmark className="w-4.5 h-4.5 text-amber-300 shrink-0" />
                <span>مستند علمی تخریج و حوالہ</span>
              </h4>
            </div>
            
            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-slate-700 text-xs sm:text-sm leading-relaxed text-right dir-rtl">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block font-sans">کتاب (Book):</span>
                  <strong className="text-slate-900 font-urdu text-sm">{selectedCitation.book}</strong>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block font-sans">مصنف (Author):</span>
                  <strong className="text-slate-800 font-urdu text-xs sm:text-sm">{selectedCitation.author}</strong>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 col-span-2">
                  <span className="text-[10px] text-slate-400 block font-sans">مقام / جلد اور صفحہ (Locator):</span>
                  <strong className="text-slate-800 font-mono text-xs font-bold">{selectedCitation.locator}</strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-bold text-emerald-900 border-r-2 border-emerald-700 pr-1.5 block">اصل عربی عبارت:</span>
                <div className="p-3.5 bg-amber-50/20 rounded-xl border border-amber-100/60 font-arabic text-base sm:text-lg text-emerald-950 font-bold leading-loose text-right whitespace-pre-line">
                  {selectedCitation.arabic_text}
                </div>
              </div>

              {selectedCitation.translation_urdu && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-sky-900 border-r-2 border-sky-700 pr-1.5 block">اردو ترجمہ:</span>
                  <div className="p-3.5 bg-sky-50/20 rounded-xl border border-sky-100 text-slate-800 leading-relaxed text-right font-urdu text-xs sm:text-sm">
                    {selectedCitation.translation_urdu}
                  </div>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="bg-slate-50 px-4 py-3 flex justify-between items-center shrink-0 border-t border-slate-100 gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedCitation(null)}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                بند کریں
              </button>
              
              <div className="flex gap-2">
                {selectedCitation.book_id && onOpenBook && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenBook(String(selectedCitation.book_id), selectedCitation.page || 1);
                      setSelectedCitation(null);
                    }}
                    className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>مطالعہ کریں</span>
                  </button>
                )}

                {selectedCitation.url && (
                  <a
                    href={selectedCitation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 bg-emerald-900 hover:bg-emerald-950 text-amber-50 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <span>اصل کتاب لنک</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
