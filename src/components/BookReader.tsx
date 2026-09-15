import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Search, Copy, Check, Languages, Loader2, BookOpen, AlertCircle, Bookmark } from 'lucide-react';
import { CatalogBook } from '../types.js';

interface BookReaderProps {
  initialBookId?: string;
  initialPageNumber?: number;
  onTranslateText?: (text: string) => void;
}

export const BookReader: React.FC<BookReaderProps> = ({
  initialBookId = '',
  initialPageNumber = 1,
  onTranslateText,
}) => {
  const [bookId, setBookId] = useState<string>(initialBookId);
  const [pageNumber, setPageNumber] = useState<number>(initialPageNumber);
  const [pageText, setPageText] = useState<string>('');
  const [bookInfo, setBookInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Book Selection catalog search
  const [bookQuery, setBookQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<CatalogBook[]>([]);
  const [isSearchingBooks, setIsSearchingBooks] = useState<boolean>(false);
  const [showCatalog, setShowCatalog] = useState<boolean>(!initialBookId);

  // Categories Explorer State
  const [categories, setCategories] = useState<any[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [categoryBooksMap, setCategoryBooksMap] = useState<Record<string, CatalogBook[]>>({});
  const [loadingCatId, setLoadingCatId] = useState<string | null>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(true);

  // Fetch categories on mount
  useEffect(() => {
    setIsLoadingCategories(true);
    fetch('/api/catalog/categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      })
      .catch((err) => console.error('Failed to load categories:', err))
      .finally(() => setIsLoadingCategories(false));
  }, []);

  const handleToggleCategory = (catId: string) => {
    if (expandedCategory === catId) {
      setExpandedCategory(null);
      return;
    }
    
    setExpandedCategory(catId);
    
    // If already fetched, don't re-fetch
    if (categoryBooksMap[catId]) {
      return;
    }

    setLoadingCatId(catId);
    fetch(`/api/catalog/books?categoryIds=${catId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.books && Array.isArray(data.books)) {
          setCategoryBooksMap((prev) => ({ ...prev, [catId]: data.books }));
        }
      })
      .catch((err) => console.error('Failed to load books for category:', err))
      .finally(() => setLoadingCatId(null));
  };

  // Selection state
  const [selectedText, setSelectedText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Search inside book
  const [insideSearch, setInsideSearch] = useState<string>('');
  const [insideMatches, setInsideMatches] = useState<number[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(-1);

  // Fetch book metadata and page text
  useEffect(() => {
    if (!bookId) return;

    setIsLoading(true);
    setError(null);
    setPageText('');

    // Fetch book details
    fetch(`/api/book/info?bookId=${bookId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.book) {
          setBookInfo(data.book);
        }
      })
      .catch((err) => console.error('Failed to load book info:', err));

    // Fetch page text
    fetch(`/api/book/page?bookId=${bookId}&page=${pageNumber}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.page && data.page.text) {
          setPageText(data.page.text);
        } else {
          setPageText('اس صفحے پر کوئی عبارت دستیاب نہیں ہے یا کتاب کا اختتام ہو چکا ہے۔');
        }
      })
      .catch((err: any) => {
        console.error('Failed to load book page:', err);
        setError('صفحہ لوڈ کرنے میں ناکامی۔ کتاب سرور اس وقت دستیاب نہیں ہے۔');
      })
      .finally(() => setIsLoading(false));
  }, [bookId, pageNumber]);

  // Sync initial props
  useEffect(() => {
    if (initialBookId) {
      setBookId(initialBookId);
      setShowCatalog(false);
    }
    if (initialPageNumber) {
      setPageNumber(initialPageNumber);
    }
  }, [initialBookId, initialPageNumber]);

  // Catalog book search
  useEffect(() => {
    if (!bookQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearchingBooks(true);
    const timer = setTimeout(() => {
      fetch(`/api/catalog/books?query=${encodeURIComponent(bookQuery.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.books && Array.isArray(data.books)) {
            setSearchResults(data.books.slice(0, 50));
          }
        })
        .catch((err) => console.error('Failed to search books:', err))
        .finally(() => setIsSearchingBooks(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [bookQuery]);

  // Search inside book implementation
  const handleInsideSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!insideSearch.trim() || !pageText) return;

    // Just a fast highlight occurrence finder on pageText
    const textLower = pageText.toLowerCase();
    const queryLower = insideSearch.toLowerCase();
    
    if (textLower.includes(queryLower)) {
      // Find count of matches
      const regex = new RegExp(insideSearch, 'gi');
      const matches = [...pageText.matchAll(regex)];
      if (matches.length > 0) {
        // Just flash positive count
        alert(`صفحہ پر "${insideSearch}" کی کل ${matches.length} مطابقتیں ملیں۔`);
      }
    } else {
      alert('اس صفحہ پر یہ لفظ نہیں ملا۔');
    }
  };

  // Text selection listener
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection) {
      const text = selection.toString().trim();
      if (text.length > 2) {
        setSelectedText(text);
      } else {
        setSelectedText('');
      }
    }
  };

  const handleCopyText = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrevPage = () => {
    if (pageNumber > 1) {
      setPageNumber(pageNumber - 1);
    }
  };

  const handleNextPage = () => {
    setPageNumber(pageNumber + 1);
  };

  // Helper to highlight terms inside arabic text block
  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;
    const parts = text.split(new RegExp(`(${search})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-amber-300 text-slate-900 rounded px-1 py-0.5 font-bold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 font-urdu p-4 text-right dir-rtl select-text">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-3">
        
        {/* Book Selector Header bar */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-3xs flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <BookOpen className="w-5 h-5 text-emerald-800 shrink-0" />
            <div className="min-w-0">
              {bookId ? (
                <div className="text-right">
                  <h3 className="text-sm font-bold text-emerald-950 truncate font-urdu">
                    {bookInfo?.title || 'کتاب لوڈ ہو رہی ہے...'}
                  </h3>
                  <p className="text-[10px] text-slate-400 truncate">
                    {bookInfo?.author?.name ? `مصنف: ${bookInfo.author.name}` : 'قدیم مصادر تراث'}
                  </p>
                </div>
              ) : (
                <span className="text-xs text-slate-500 font-bold">مطالعہ کے لیے کتاب منتخب کریں:</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => setShowCatalog(!showCatalog)}
              className="text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 rounded-xl font-bold transition-all border border-emerald-200/50 cursor-pointer flex items-center gap-1 shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{showCatalog ? 'کتاب چھپائیں' : 'دوسری کتاب منتخب کریں'}</span>
            </button>
          </div>
        </div>

        {/* Catalog Selection / Library Explorer */}
        {(showCatalog || !bookId) && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs space-y-4 shrink-0 flex-1 flex flex-col min-h-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-800" />
                  <span>تراث کتب خانہ (کتاب یا زمرہ منتخب کریں)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  کتاب کا نام لکھ کر تلاش کریں یا نیچے دیے گئے زمروں میں سے کتاب منتخب کر کے مطالعہ کریں۔
                </p>
              </div>
              {bookId && (
                <button
                  onClick={() => setShowCatalog(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  واپس مطالعہ پر جائیں ✕
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              <input
                type="text"
                placeholder="لائبریری کی کتب یا مصنف تلاش کریں (مثال کے طور پر: الہدایہ، رد المحتار، فتح الباری، المبسوط)..."
                value={bookQuery}
                onChange={(e) => setBookQuery(e.target.value)}
                className="w-full bg-slate-50 text-xs border border-slate-200 rounded-xl pr-10 pl-3 py-3 font-urdu focus:outline-none focus:ring-1 focus:ring-emerald-800 focus:bg-white transition-all shadow-inner"
              />
              {bookQuery && (
                <button
                  onClick={() => setBookQuery('')}
                  className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Search Results Display */}
            {isSearchingBooks ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 text-emerald-800 animate-spin" />
                <span className="text-xs font-urdu">کتب تلاش کی جا رہی ہیں...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="flex-1 overflow-y-auto pr-1">
                <p className="text-xs font-bold text-slate-600 mb-2">تلاش کے نتائج ({searchResults.length}):</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {searchResults.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => {
                        setBookId(String(book.id));
                        setPageNumber(1);
                        setShowCatalog(false);
                        setSearchResults([]);
                        setBookQuery('');
                      }}
                      className="text-right p-3 rounded-xl border border-slate-200/80 hover:border-emerald-500 hover:bg-emerald-50/50 text-xs transition-all flex flex-col justify-between gap-1.5 cursor-pointer bg-white group shadow-3xs"
                    >
                      <div className="space-y-1">
                        <span className="font-bold text-slate-800 group-hover:text-emerald-900 line-clamp-1">
                          {book.title}
                        </span>
                        <span className="text-[11px] text-slate-500 line-clamp-1">
                          {book.author?.name || 'قدیم مصنف'}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-800 font-bold self-start bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 group-hover:bg-emerald-800 group-hover:text-white transition-colors">
                        مطالعہ شروع کریں ←
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : bookQuery.trim() ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <p className="text-xs font-bold text-slate-500">کوئی کتاب نہیں ملی۔</p>
                <p className="text-[11px]">برائے مہربانی کوئی دوسرا نام یا لفظ لکھ کر تلاش کریں۔</p>
              </div>
            ) : (
              /* Categories & Books Explorer List */
              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <p className="text-xs font-bold text-slate-700">تمام فقہی و علمی زمرہ جات (Categories):</p>
                  <span className="text-[11px] text-slate-400">
                    {categories.length > 0 ? `${categories.length} زمرے دستیاب ہیں` : ''}
                  </span>
                </div>

                {isLoadingCategories ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                    <Loader2 className="w-6 h-6 text-emerald-800 animate-spin" />
                    <span className="text-xs font-urdu">زمرہ جات لوڈ ہو رہے ہیں...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {categories.map((cat) => {
                      const catTitle = cat.title || cat.name || `زمرہ نمبر ${cat.id}`;
                      const isExpanded = expandedCategory === String(cat.id);
                      const booksForCat = categoryBooksMap[String(cat.id)] || [];
                      const isLoadingThisCat = loadingCatId === String(cat.id);

                      return (
                        <div
                          key={cat.id}
                          className={`border rounded-xl transition-all overflow-hidden bg-white ${
                            isExpanded ? 'border-emerald-300 ring-1 ring-emerald-100 shadow-3xs' : 'border-slate-200/80 hover:border-slate-300'
                          }`}
                        >
                          <button
                            onClick={() => handleToggleCategory(String(cat.id))}
                            className={`w-full flex items-center justify-between p-3 text-right transition-colors cursor-pointer ${
                              isExpanded ? 'bg-emerald-50/60' : 'bg-slate-50/60 hover:bg-slate-100/70'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${isExpanded ? 'bg-emerald-600' : 'bg-slate-300'}`} />
                              <span className="font-bold text-slate-800 text-xs">{catTitle}</span>
                              {cat.bookCount ? (
                                <span className="text-[10px] bg-white text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-mono font-bold">
                                  {cat.bookCount} کتب
                                </span>
                              ) : null}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">
                                {isExpanded ? 'بند کریں' : 'کتابیں دیکھیں'}
                              </span>
                              <span className="text-slate-400 font-sans text-xs">
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="p-3 border-t border-slate-100 bg-white">
                              {isLoadingThisCat ? (
                                <div className="flex flex-col items-center justify-center py-6 text-slate-400 space-y-1.5">
                                  <Loader2 className="w-5 h-5 text-emerald-800 animate-spin" />
                                  <span className="text-[11px] font-urdu">کتابیں لوڈ ہو رہی ہیں...</span>
                                </div>
                              ) : booksForCat.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {booksForCat.map((book) => (
                                    <button
                                      key={book.id}
                                      onClick={() => {
                                        setBookId(String(book.id));
                                        setPageNumber(1);
                                        setShowCatalog(false);
                                      }}
                                      className="text-right p-2.5 rounded-lg border border-slate-150 hover:border-emerald-500 hover:bg-emerald-50/50 text-xs transition-all flex flex-col justify-between gap-1 cursor-pointer bg-slate-50/30 group"
                                    >
                                      <div>
                                        <span className="font-bold text-slate-800 group-hover:text-emerald-900 line-clamp-1">
                                          {book.title}
                                        </span>
                                        <span className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                                          {book.author?.name || 'قدیم مصنف'}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-emerald-700 font-bold self-start mt-1 group-hover:underline">
                                        مطالعہ کریں ←
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 text-center py-4">
                                  اس زمرے میں کوئی کتاب دستیاب نہیں ہے۔
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Book Content Panel */}
        {bookId && !showCatalog ? (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4">
            
            {/* Sidebar Tools - Navigation and Search Inside */}
            <div className="w-full md:w-60 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs space-y-4 shrink-0 flex flex-col">
              
              {/* Pagination controls */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Bookmark className="w-4 h-4 text-emerald-800" />
                  <span>صفحہ نیویگیشن:</span>
                </span>
                
                <div className="grid grid-cols-3 gap-2 items-center text-center">
                  <button
                    onClick={handlePrevPage}
                    disabled={pageNumber <= 1}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer border border-slate-200/50 disabled:opacity-40"
                    title="پچھلا صفحہ"
                  >
                    <ArrowRight className="w-4 h-4 mx-auto" />
                  </button>

                  <div className="font-mono text-xs font-bold text-slate-800 flex items-center justify-center gap-1">
                    <span>ص</span>
                    <input
                      type="number"
                      value={pageNumber}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        if (num > 0) setPageNumber(num);
                      }}
                      className="w-12 text-center bg-slate-100 rounded border border-slate-200 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-800 text-xs font-mono font-bold"
                    />
                  </div>

                  <button
                    onClick={handleNextPage}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer border border-slate-200/50"
                    title="اگلا صفحہ"
                  >
                    <ArrowLeft className="w-4 h-4 mx-auto" />
                  </button>
                </div>
              </div>

              {/* Find inside page */}
              <form onSubmit={handleInsideSearch} className="space-y-2 pt-3 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700">اس صفحہ پر تلاش کریں:</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="مخصوص لفظ..."
                    value={insideSearch}
                    onChange={(e) => setInsideSearch(e.target.value)}
                    className="w-full bg-slate-50 text-[11px] border border-slate-200 rounded-lg pr-8 pl-3 py-1.5 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!insideSearch.trim() || !pageText}
                  className="w-full py-1.5 rounded-lg bg-emerald-950/5 hover:bg-emerald-950/10 text-emerald-900 border border-emerald-800/20 text-[11px] font-bold transition-all cursor-pointer"
                >
                  صفحہ پر ہائی لائٹ کریں
                </button>
              </form>

              {/* Text Selection Floating Utility helper box */}
              {selectedText && (
                <div className="bg-amber-400/5 p-3 rounded-xl border border-amber-500/20 space-y-2.5 pt-3 mt-auto">
                  <p className="text-[10px] text-amber-900 font-bold leading-normal">
                    عبارت منتخب کی گئی ہے ({selectedText.substring(0, 15)}...):
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleCopyText(selectedText)}
                      className="py-1.5 px-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold flex items-center justify-center gap-1 text-slate-700 cursor-pointer"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-800" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'کاپی ہو گیا' : 'کاپی کریں'}</span>
                    </button>

                    {onTranslateText && (
                      <button
                        onClick={() => onTranslateText(selectedText)}
                        className="py-1.5 px-2 rounded-lg bg-emerald-900 text-amber-50 hover:bg-emerald-950 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Languages className="w-3 h-3 text-amber-300" />
                        <span>ترجمہ کریں</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Content Display page Text */}
            <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 shadow-3xs p-6 flex flex-col min-h-0 relative">
              {isLoading ? (
                <div className="absolute inset-0 bg-white/80 z-20 flex flex-col justify-center items-center space-y-2">
                  <Loader2 className="w-8 h-8 text-emerald-800 animate-spin" />
                  <p className="text-xs text-slate-500 font-bold">تراش آن لائن سے صفحہ حاصل کیا جا رہا ہے...</p>
                </div>
              ) : null}

              {error ? (
                <div className="flex-1 flex flex-col justify-center items-center py-12 text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                  <p className="text-xs text-slate-600 font-bold">{error}</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="border-b border-slate-100 pb-2 mb-4 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono">موجودہ صفحہ: {pageNumber}</span>
                    <span className="font-urdu">عربی عبارت منتخب کر کے ترجمہ کار یا کاپی کا استعمال کریں۔</span>
                  </div>

                  {/* Main Page text scrollbox */}
                  <div
                    onMouseUp={handleTextSelection}
                    onTouchEnd={handleTextSelection}
                    className="flex-1 overflow-y-auto text-lg text-slate-800 leading-relaxed font-arabic select-text text-justify pr-1 font-medium whitespace-pre-wrap leading-loose select-text"
                    style={{ minHeight: '200px' }}
                  >
                    {highlightText(pageText, insideSearch)}
                  </div>
                </div>
              )}
            </div>

          </div>
        ) : null}

      </div>
    </div>
  );
};
