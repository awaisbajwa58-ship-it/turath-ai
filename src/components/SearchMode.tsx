import React, { useState, useEffect } from 'react';
import { Search, BookOpen, ExternalLink, Loader2, BookOpenCheck, HelpCircle } from 'lucide-react';
import { CatalogCategory, CatalogBook, SourceCitation } from '../types.js';

interface SearchModeProps {
  onOpenBook: (bookId: string, pageNumber: number) => void;
}

export const SearchMode: React.FC<SearchModeProps> = ({ onOpenBook }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [results, setResults] = useState<SourceCitation[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [books, setBooks] = useState<CatalogBook[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Search input query
  const [catSearch, setCatSearch] = useState<string>('');
  const [bookSearch, setBookSearch] = useState<string>('');

  // Initial categories fetch
  useEffect(() => {
    fetch('/api/catalog/categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      })
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  // Fetch books when category changes
  useEffect(() => {
    if (selectedCatIds.length === 0) {
      setBooks([]);
      return;
    }
    fetch(`/api/catalog/books?categoryIds=${selectedCatIds.join(',')}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.books && Array.isArray(data.books)) {
          setBooks(data.books);
        }
      })
      .catch((err) => console.error('Failed to load books:', err));
  }, [selectedCatIds]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);
    setResults([]);

    try {
      const url = new URL('/api/search/literal', window.location.origin);
      url.searchParams.append('query', searchQuery.trim());
      if (selectedBookIds.length > 0) {
        url.searchParams.append('bookIds', selectedBookIds.join(','));
      }
      if (selectedCatIds.length > 0) {
        url.searchParams.append('categoryIds', selectedCatIds.join(','));
      }

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error('تلاش کے دوران علمی سرور سے رابطہ نہیں ہو سکا۔');
      }

      const data = await res.json();
      if (data.results) {
        setResults(data.results);
      } else {
        setResults([]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'تلاش کے دوران کچھ خرابی پیش آئی۔');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleCategory = (catId: string) => {
    setSelectedCatIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const toggleBook = (bookId: string) => {
    setSelectedBookIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
  };

  const filteredCategories = categories.filter((c) =>
    catSearch ? c.title.toLowerCase().includes(catSearch.toLowerCase()) : true
  );

  const filteredBooks = books.filter((b) =>
    bookSearch ? b.title.toLowerCase().includes(bookSearch.toLowerCase()) : true
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 font-urdu p-4 text-right dir-rtl select-text">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-4">
        
        {/* Top explanation */}
        <div className="bg-emerald-950/5 border border-emerald-900/10 rounded-2xl p-4 flex gap-3 items-start">
          <BookOpenCheck className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-emerald-950">عمومی تلاش (Literal Search)</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              منتخب کتب اور علمی زمروں کے اندر مخصوص الفاظ، فقرے یا فقہی اصطلاحات تلاش کریں۔ تلاش کے نتائج میں کتب کی اصل عبارت اور جلد/صفحہ نمبر دکھائے جائیں گے۔ آپ کسی بھی عبارت کے ساتھ موجود بٹن دبا کر اس کے متعلقہ صفحے کا براہِ راست مطالعہ کر سکتے ہیں۔
            </p>
          </div>
        </div>

        {/* Search composer */}
        <form onSubmit={handleSearch} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-3xs space-y-3 shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              <input
                type="text"
                placeholder="تلاش کے لیے عربی یا اردو الفاظ لکھیں (مثلاً: ماء الورد، بیع الوفا)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 text-sm border border-slate-200 rounded-xl pr-10 pl-3 py-3 font-urdu focus:outline-none focus:ring-1 focus:ring-emerald-800 text-slate-800"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-6 py-3 rounded-xl bg-emerald-900 hover:bg-emerald-950 text-amber-50 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>تلاش کریں</span>
            </button>
          </div>

          {/* Toggle advanced filters button */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>{showFilters ? 'مخصوص فلٹرز چھپائیں' : 'مخصوص فلٹرز کتب/زمرے لگائیں'}</span>
              <span className="text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {selectedBookIds.length > 0 
                  ? `${selectedBookIds.length} کتب منتخب` 
                  : selectedCatIds.length > 0 
                  ? `${selectedCatIds.length} زمرے منتخب` 
                  : 'تمام کتب'}
              </span>
            </button>

            {(selectedBookIds.length > 0 || selectedCatIds.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCatIds([]);
                  setSelectedBookIds([]);
                }}
                className="text-[10px] text-red-700 hover:text-red-900 font-bold hover:underline"
              >
                تمام فلٹرز صاف کریں
              </button>
            )}
          </div>

          {/* Expanded filters panel */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              
              {/* Category Selector */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">مکتب یا علمی زمرے:</span>
                <input
                  type="text"
                  placeholder="زمرہ تلاش کریں..."
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  className="w-full bg-slate-50 text-[11px] border border-slate-200 rounded-lg pr-3 pl-3 py-1 text-slate-700 focus:outline-none"
                />
                <div className="h-28 overflow-y-auto border border-slate-100 rounded-xl p-1.5 space-y-1 bg-slate-50/50">
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCatIds.includes(String(cat.id));
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => toggleCategory(String(cat.id))}
                        className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          isSelected ? 'bg-emerald-800 text-amber-50 font-bold' : 'hover:bg-slate-200/50 text-slate-700'
                        }`}
                      >
                        <span>{cat.title}</span>
                        <span className={`text-[9px] px-1 rounded ${isSelected ? 'bg-emerald-950 text-amber-100' : 'bg-slate-200 text-slate-500'}`}>
                          {cat.bookCount} کتب
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Book Selector */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">مخصوص کتب میں تلاش:</span>
                <input
                  type="text"
                  placeholder="کتاب تلاش کریں..."
                  value={bookSearch}
                  onChange={(e) => setBookSearch(e.target.value)}
                  className="w-full bg-slate-50 text-[11px] border border-slate-200 rounded-lg pr-3 pl-3 py-1 text-slate-700 focus:outline-none"
                />
                <div className="h-28 overflow-y-auto border border-slate-100 rounded-xl p-1.5 space-y-1 bg-slate-50/50">
                  {selectedCatIds.length === 0 ? (
                    <p className="text-[10px] text-slate-400 text-center pt-8">پہلے کوئی زمرہ منتخب کریں</p>
                  ) : filteredBooks.length === 0 ? (
                    <p className="text-[10px] text-slate-400 text-center pt-8">کوئی کتاب نہیں ملی</p>
                  ) : (
                    filteredBooks.map((book) => {
                      const isSelected = selectedBookIds.includes(String(book.id));
                      return (
                        <button
                          type="button"
                          key={book.id}
                          onClick={() => toggleBook(String(book.id))}
                          className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                            isSelected ? 'bg-emerald-800 text-amber-50 font-bold' : 'hover:bg-slate-200/50 text-slate-700'
                          }`}
                        >
                          <span className="truncate pr-1">{book.title}</span>
                          {book.author?.name && (
                            <span className="text-[9px] opacity-70 truncate shrink-0 max-w-[80px]">{book.author.name}</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          )}
        </form>

        {/* Results Area */}
        <div className="flex-1 min-h-0 flex flex-col">
          {isSearching ? (
            <div className="flex-1 flex flex-col justify-center items-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-emerald-800 animate-spin" />
              <p className="text-xs text-slate-500 font-bold">تراش و نصوص لائبریری سے تلاش جاری ہے...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col justify-center items-center py-12 text-center max-w-md mx-auto space-y-3">
              <span className="p-3 bg-red-50 text-red-800 rounded-full font-mono text-xl">⚠️</span>
              <p className="text-xs text-slate-600 font-bold">{error}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex-1 flex flex-col justify-center items-center py-12 text-center text-slate-400 space-y-2 border border-dashed border-slate-200 rounded-2xl bg-white p-6">
              <HelpCircle className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-500">ابھی کوئی نتیجہ دستیاب نہیں ہے۔</p>
              <p className="text-[11px] text-slate-400 max-w-sm leading-relaxed">
                اوپر تلاش کے خانے میں فقرہ یا کلمہ لکھیں اور نصوص لائبریری کے ذخائر سے تلاش کے نتائج پائیں۔
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="flex items-center justify-between px-1 shrink-0">
                <span className="text-xs font-bold text-slate-500">تلاش کے کل نتائج: {results.length}</span>
              </div>
              
              <div className="space-y-3">
                {results.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-white rounded-2xl border border-slate-200/70 hover:border-emerald-200/80 hover:shadow-2xs transition-all space-y-3 relative overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-emerald-900 block font-urdu">
                          {item.book}
                        </span>
                        <span className="text-[10px] text-slate-400 font-urdu block">
                          مصنف: {item.author}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          {item.locator}
                        </span>

                        <button
                          onClick={() => onOpenBook(String(item.book_id), item.page)}
                          className="text-[10px] text-emerald-800 hover:text-emerald-950 font-bold bg-amber-400/10 hover:bg-amber-400/20 px-2.5 py-1 rounded transition-colors flex items-center gap-1 border border-amber-500/20 cursor-pointer"
                          title="مطالعہ کتب میں کھولیں"
                        >
                          <BookOpen className="w-3 h-3 text-emerald-800" />
                          <span>مطالعہ کریں</span>
                        </button>
                      </div>
                    </div>

                    {/* Text block */}
                    <div className="text-sm text-slate-700 leading-relaxed font-arabic bg-slate-50/50 p-3 rounded-xl border border-slate-100 select-text whitespace-pre-wrap text-justify leading-loose font-medium">
                      {item.arabic_text}
                    </div>

                    {/* Footer citation url */}
                    {item.url && (
                      <div className="flex justify-end">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-slate-400 hover:text-emerald-900 transition-colors flex items-center gap-1 hover:underline"
                        >
                          <span>تراث آن لائن لنک</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
