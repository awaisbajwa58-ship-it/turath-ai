import React, { useState, useEffect } from 'react';
import { SourceFilterType, CatalogCategory, CatalogBook, CatalogAuthor } from '../types.js';
import { Filter, BookOpen, CheckSquare, Square, Search, X, User, Layers, Check } from 'lucide-react';

interface SourceFilterProps {
  selectedFilter: SourceFilterType;
  onSelectFilter: (filter: SourceFilterType) => void;
  selectedCategoryIds: string[];
  onSelectCategoryIds: (catIds: string[]) => void;
  selectedBookIds: string[];
  onSelectBookIds: (bookIds: string[]) => void;
  selectedAuthorId: string;
  onSelectAuthorId: (authorId: string) => void;
  disabled?: boolean;
}

export const SourceFilter: React.FC<SourceFilterProps> = ({
  selectedFilter,
  onSelectFilter,
  selectedCategoryIds = [],
  onSelectCategoryIds,
  selectedBookIds = [],
  onSelectBookIds,
  selectedAuthorId,
  onSelectAuthorId,
  disabled = false,
}) => {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [books, setBooks] = useState<CatalogBook[]>([]);
  const [authors, setAuthors] = useState<CatalogAuthor[]>([]);
  
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [bookSearchQuery, setBookSearchQuery] = useState<string>('');
  const [authorSearchQuery, setAuthorSearchQuery] = useState<string>('');
  const [isLoadingBooks, setIsLoadingBooks] = useState<boolean>(false);

  // Fetch categories on mount
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

  // Fetch books dynamically based on selected categories
  useEffect(() => {
    let catIdsToFetch: string[] = [];
    if (selectedCategoryIds && selectedCategoryIds.length > 0) {
      catIdsToFetch = selectedCategoryIds;
    } else {
      // If no categories selected, show books from common presets or don't fetch
      const presetId = selectedFilter === 'hanafi' ? '14' : selectedFilter === 'usul' ? '11' : selectedFilter === 'hadith' ? '6' : selectedFilter === 'tafsir' ? '3' : '';
      if (presetId) {
        catIdsToFetch = [presetId];
      }
    }

    if (catIdsToFetch.length === 0) {
      setBooks([]);
      return;
    }

    // Optimization: If all categories are selected, omit the query parameter to keep URI extremely short
    const isAllCategoriesSelected = categories.length > 0 && selectedCategoryIds.length >= categories.length;
    const url = isAllCategoriesSelected 
      ? '/api/catalog/books' 
      : `/api/catalog/books?categoryIds=${catIdsToFetch.join(',')}`;

    setIsLoadingBooks(true);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load books');
        return res.json();
      })
      .then((data) => {
        if (data.books && Array.isArray(data.books)) {
          setBooks(data.books);
        }
      })
      .catch((err) => console.error('Failed to load books:', err))
      .finally(() => setIsLoadingBooks(false));
  }, [selectedCategoryIds, selectedFilter, categories.length]);

  // Fetch authors on search input
  useEffect(() => {
    if (!authorSearchQuery.trim()) {
      setAuthors([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/catalog/authors?query=${encodeURIComponent(authorSearchQuery.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.authors && Array.isArray(data.authors)) {
            setAuthors(data.authors);
          }
        })
        .catch((err) => console.error('Failed to search authors:', err));
    }, 300);
    return () => clearTimeout(timer);
  }, [authorSearchQuery]);

  const toggleCategorySelection = (catId: string) => {
    const isSelecting = !selectedCategoryIds.includes(catId);
    let updated: string[];
    if (selectedCategoryIds.includes(catId)) {
      updated = selectedCategoryIds.filter((id) => id !== catId);
    } else {
      updated = [...selectedCategoryIds, catId];
    }
    onSelectCategoryIds(updated);

    // Auto-select or auto-deselect all books belonging to this category
    setIsLoadingBooks(true);
    fetch(`/api/catalog/books?categoryIds=${catId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.books && Array.isArray(data.books)) {
          const targetBookIds = data.books.map((b: any) => String(b.id));
          if (isSelecting) {
            // Append target books to current selection
            const combined = Array.from(new Set([...selectedBookIds, ...targetBookIds]));
            onSelectBookIds(combined);
          } else {
            // Remove target books from current selection
            const filtered = selectedBookIds.filter((id) => !targetBookIds.includes(id));
            onSelectBookIds(filtered);
          }
        }
      })
      .catch((err) => console.error('Failed to auto-select/deselect books for category:', err))
      .finally(() => setIsLoadingBooks(false));
    
    // Auto-update standard preset filters
    if (updated.length === 1) {
      const single = updated[0];
      if (single === '14') onSelectFilter('hanafi');
      else if (single === '11') onSelectFilter('usul');
      else if (single === '6') onSelectFilter('hadith');
      else if (single === '3') onSelectFilter('tafsir');
      else onSelectFilter('custom');
    } else if (updated.length > 1) {
      onSelectFilter('custom');
    } else {
      onSelectFilter('all');
    }
  };

  const handleSelectAllCategories = () => {
    const allIds = categories.map((c) => String(c.id));
    onSelectCategoryIds(allIds);
    onSelectFilter('custom');

    // Auto-select all books across all categories as well
    setIsLoadingBooks(true);
    fetch('/api/catalog/books')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load books');
        return res.json();
      })
      .then((data) => {
        if (data.books && Array.isArray(data.books)) {
          const allBookIds = data.books.map((b: any) => String(b.id));
          onSelectBookIds(allBookIds);
        }
      })
      .catch((err) => console.error('Failed to auto-select all books:', err))
      .finally(() => setIsLoadingBooks(false));
  };

  const handleClearAllCategories = () => {
    onSelectCategoryIds([]);
    onSelectBookIds([]);
    onSelectFilter('all');
  };

  const toggleBookSelection = (bookId: string) => {
    if (selectedBookIds.includes(bookId)) {
      onSelectBookIds(selectedBookIds.filter((id) => id !== bookId));
    } else {
      onSelectBookIds([...selectedBookIds, bookId]);
    }
  };

  const handleSelectAllBooks = () => {
    const filteredIds = filteredBooks.map((b) => String(b.id));
    onSelectBookIds(Array.from(new Set([...selectedBookIds, ...filteredIds])));
  };

  const handleClearAllBooks = () => {
    onSelectBookIds([]);
  };

  const filteredCategories = categories.filter((c) =>
    categorySearchQuery ? c.title.toLowerCase().includes(categorySearchQuery.toLowerCase()) : true
  );

  const filteredBooks = books.filter((b) =>
    bookSearchQuery ? b.title.toLowerCase().includes(bookSearchQuery.toLowerCase()) : true
  );

  return (
    <div className="space-y-5 text-right dir-rtl font-urdu">
      
      {/* 1. Category Selection Block */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-800" />
            فقہی مکاتب اور علمی زمرے (Categories)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSelectAllCategories}
              className="text-[10px] text-emerald-800 hover:text-emerald-950 font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
            >
              سب منتخب کریں
            </button>
            <button
              type="button"
              onClick={handleClearAllCategories}
              className="text-[10px] text-red-800 hover:text-red-950 font-bold bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
            >
              سب ختم کریں
            </button>
          </div>
        </div>

        {/* Category search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
          <input
            type="text"
            placeholder="زمرہ تلاش کریں..."
            value={categorySearchQuery}
            onChange={(e) => setCategorySearchQuery(e.target.value)}
            className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg pr-8 pl-3 py-1.5 text-slate-800 font-urdu focus:outline-none focus:ring-1 focus:ring-emerald-800"
          />
        </div>

        {/* Categories list */}
        <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-1.5 bg-white">
          {filteredCategories.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-2">کوئی زمرہ نہیں ملا</p>
          ) : (
            filteredCategories.map((cat) => {
              const catIdStr = String(cat.id);
              const isSelected = selectedCategoryIds.includes(catIdStr);
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => toggleCategorySelection(catIdStr)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-950 border border-emerald-200 font-bold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    )}
                    <span className="truncate">{cat.title}</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-emerald-800 text-amber-100' : 'bg-slate-100 text-slate-500'}`}>
                    {cat.bookCount} کتب
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Book Selection Block */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-emerald-800" />
            تحقیقی کتب منتخب کریں (Books)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSelectAllBooks}
              className="text-[10px] text-emerald-800 hover:text-emerald-950 font-bold bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
            >
              سب منتخب کریں
            </button>
            <button
              type="button"
              onClick={handleClearAllBooks}
              className="text-[10px] text-red-800 hover:text-red-950 font-bold bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
            >
              سب ختم کریں
            </button>
          </div>
        </div>

        {/* Book search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
          <input
            type="text"
            placeholder="کتاب تلاش کریں..."
            value={bookSearchQuery}
            onChange={(e) => setBookSearchQuery(e.target.value)}
            className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg pr-8 pl-3 py-1.5 text-slate-800 font-urdu focus:outline-none focus:ring-1 focus:ring-emerald-800"
          />
        </div>

        {/* Books list */}
        <div className="max-h-44 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-1.5 bg-white">
          {isLoadingBooks ? (
            <p className="text-[11px] text-emerald-800 text-center py-4">کتب لوڈ کی جا رہی ہیں...</p>
          ) : filteredBooks.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-4">
              {selectedCategoryIds.length === 0 
                ? 'براہ کرم کتب ظاہر کرنے کے لیے پہلے کوئی زمرہ منتخب کریں' 
                : 'اس زمرے میں کوئی کتاب دستیاب نہیں ہے'}
            </p>
          ) : (
            filteredBooks.map((book) => {
              const bookIdStr = String(book.id);
              const isSelected = selectedBookIds.includes(bookIdStr);
              return (
                <button
                  type="button"
                  key={book.id}
                  onClick={() => toggleBookSelection(bookIdStr)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-950 border border-emerald-200 font-bold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    )}
                    <span className="truncate">{book.title}</span>
                  </div>
                  {book.author?.name && (
                    <span className="text-[10px] text-slate-400 max-w-[100px] truncate">
                      {book.author.name}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Optional Author Filter Block */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <User className="w-4 h-4 text-emerald-800" />
          مصنف کی تخصیص (اختیاری)
        </label>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
          <input
            type="text"
            placeholder="مصنف کا نام (ابن عابدين، الکاسانی وغیرہ)..."
            value={authorSearchQuery}
            onChange={(e) => setAuthorSearchQuery(e.target.value)}
            className="w-full bg-slate-50 text-xs border border-slate-200 rounded-lg pr-8 pl-8 py-1.5 text-slate-800 font-urdu focus:outline-none focus:ring-1 focus:ring-emerald-800"
          />
          {selectedAuthorId && (
            <button
              type="button"
              onClick={() => {
                onSelectAuthorId('');
                setAuthorSearchQuery('');
              }}
              className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Author recommendations results drop list */}
        {authors.length > 0 && (
          <div className="max-h-28 overflow-y-auto bg-white border border-slate-200 rounded-lg p-1 space-y-1">
            {authors.map((author) => (
              <button
                type="button"
                key={author.id}
                onClick={() => {
                  onSelectAuthorId(String(author.id));
                  setAuthorSearchQuery(author.name);
                  setAuthors([]);
                }}
                className={`w-full text-right p-1.5 text-xs rounded hover:bg-emerald-50 ${
                  selectedAuthorId === String(author.id) ? 'bg-emerald-800 text-amber-50 font-bold' : 'text-slate-700'
                }`}
              >
                {author.name}
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
