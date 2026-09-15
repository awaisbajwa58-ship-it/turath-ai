import React, { useState, useEffect, useRef } from 'react';
import { SourceFilter } from './components/SourceFilter.js';
import { LoadingState } from './components/LoadingState.js';
import { AnswerView } from './components/AnswerView.js';
import { SearchMode } from './components/SearchMode.js';
import { BookReader } from './components/BookReader.js';
import { TranslationTool } from './components/TranslationTool.js';
import { ApiKeyModal } from './components/ApiKeyModal.js';
import {
  SourceFilterType,
  ChatMessage,
  ChatConversation,
  ResearchResponse,
  SourceCitation
} from './types.js';
import {
  Plus,
  MessageSquare,
  Trash2,
  Send,
  Database,
  SlidersHorizontal,
  X,
  Sparkles,
  HelpCircle,
  Menu,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  BookOpen,
  Info,
  Search,
  Languages,
  Key,
  ShieldCheck
} from 'lucide-react';

export default function App() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  
  // Workspace tabs state management
  const [activeTab, setActiveTab] = useState<'chat' | 'search' | 'reader' | 'translator'>('chat');
  const [readerBookId, setReaderBookId] = useState<string>('');
  const [readerPageNumber, setReaderPageNumber] = useState<number>(1);
  const [translatorInitialText, setTranslatorInitialText] = useState<string>('');

  // Environment & Gemini API Key Management
  const [authStatus, setAuthStatus] = useState<{
    isDevMode: boolean;
    hasServerKey: boolean;
    requiresUserKey: boolean;
    environmentName: string;
  } | null>(null);
  const [userApiKey, setUserApiKey] = useState<string>('');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);

  const handleOpenBookInReader = (bookId: string, pageNumber: number) => {
    setReaderBookId(bookId);
    setReaderPageNumber(pageNumber);
    setActiveTab('reader');
  };

  const handleTranslateInPanel = (text: string) => {
    setTranslatorInitialText(text);
    setActiveTab('translator');
  };
  
  // Drawer states
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);
  const [isThreeDotMenuOpen, setIsThreeDotMenuOpen] = useState<boolean>(false);
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Active filters for the current conversation (bound dynamically to session state)
  const [selectedFilter, setSelectedFilter] = useState<SourceFilterType>('all');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [selectedAuthorId, setSelectedAuthorId] = useState<string>('');
  const [manualMode, setManualMode] = useState<'auto' | 'exact' | 'similar' | 'conceptual'>('auto');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Initial State Loading & Storage Hook
  useEffect(() => {
    // Load stored user API key if present
    const storedKey = localStorage.getItem('nusus_gemini_api_key') || '';
    setUserApiKey(storedKey);

    const isEmbeddedInStudio = (() => {
      try {
        return window.self !== window.top;
      } catch (e) {
        return false;
      }
    })();

    // Any shared URL (like service-*.ai.studio, ais-pre-*, or standalone external view) is Public User Mode
    const isExplicitSharedLink =
      window.location.hostname.includes('service-') ||
      window.location.hostname.includes('ais-pre-') ||
      !isEmbeddedInStudio;

    // Query environment and auth status from server
    fetch('/api/config/auth-status', {
      headers: {
        'x-client-embedded': isEmbeddedInStudio ? 'true' : 'false',
      },
    })
      .then((r) => r.json())
      .then((status) => {
        // If accessed via shared link, enforce public user requirements
        const effectiveStatus = isExplicitSharedLink
          ? { ...status, isDevMode: false, requiresUserKey: true, environmentName: 'Public Shared' }
          : status;

        setAuthStatus(effectiveStatus);

        // Show key prompt popup immediately if in public/shared mode and no key is saved
        if (effectiveStatus.requiresUserKey && !storedKey) {
          setIsApiKeyModalOpen(true);
        }
      })
      .catch((err) => {
        console.warn('Failed to load auth status from server:', err);
        if (!storedKey) {
          setIsApiKeyModalOpen(true);
        }
      });

    let loadedConvs: ChatConversation[] = [];
    try {
      const stored = localStorage.getItem('nusus_conversations_v2');
      if (stored) {
        loadedConvs = JSON.parse(stored) as ChatConversation[];
      }
    } catch (e) {
      console.error('Failed to parse local conversations:', e);
    }

    // Always start with a completely fresh, empty conversation on launch
    const welcomeId = 'welcome-' + Date.now();
    const welcomeConv: ChatConversation = {
      id: welcomeId,
      title: 'نئی علمی تحقیق',
      messages: [
        {
          id: 'welcome-msg',
          role: 'assistant',
          text: 'خوش آمدید! نصوص ریسرچ سسٹم کے جدید مکالماتی معاون میں آپ کا استقبال ہے۔\n\nکلاسیکی اسلامی کتب کے ذخیرے سے علمی و تحقیقی معاونت حاصل کرنے کے لیے اپنا سوال نیچے لکھیں۔',
          timestamp: new Date().toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' }),
        }
      ],
      categoryIds: [],
      bookIds: [],
      filterType: 'all',
      authorId: '',
      manualMode: 'auto',
    };

    if (loadedConvs.length > 0) {
      // Put the fresh clean welcome conversation at the top of the list
      setConversations([welcomeConv, ...loadedConvs]);
    } else {
      setConversations([welcomeConv]);
    }
    setActiveConversationId(welcomeId);
  }, []);

  const handleSaveUserKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem('nusus_gemini_api_key', key);
  };

  const handleRemoveUserKey = () => {
    setUserApiKey('');
    localStorage.removeItem('nusus_gemini_api_key');
  };

  // Sync state changes to LocalStorage (filtering out any conversation that has no user message)
  useEffect(() => {
    if (conversations.length > 0) {
      const validConvs = conversations.filter(c => 
        c.messages.some(m => m.role === 'user')
      );
      localStorage.setItem('nusus_conversations_v2', JSON.stringify(validConvs));
    }
  }, [conversations]);

  // Handle active conversation selection change
  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    const found = conversations.find((c) => c.id === id);
    if (found) {
      applyFiltersFromConversation(found);
    }
  };

  const applyFiltersFromConversation = (conv: ChatConversation) => {
    setSelectedFilter(conv.filterType || 'all');
    setSelectedCategoryIds(conv.categoryIds || []);
    setSelectedBookIds(conv.bookIds || []);
    setSelectedAuthorId(conv.authorId || '');
    setManualMode(conv.manualMode || 'auto');
  };

  // Sync active filters back to the active conversation state
  useEffect(() => {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConversationId) {
          return {
            ...c,
            filterType: selectedFilter,
            categoryIds: selectedCategoryIds,
            bookIds: selectedBookIds,
            authorId: selectedAuthorId,
            manualMode,
          };
        }
        return c;
      })
    );
  }, [selectedFilter, selectedCategoryIds, selectedBookIds, selectedAuthorId, manualMode, activeConversationId]);

  // Scroll message feed smoothly to the bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConversationId, isSearching]);

  // Start a new research session
  const handleNewConversation = () => {
    const newId = 'conv-' + Date.now();
    const newConv: ChatConversation = {
      id: newId,
      title: 'نئی علمی تحقیق',
      messages: [
        {
          id: 'welcome-new',
          role: 'assistant',
          text: 'میں ایک نیا تحقیقی سیشن شروع کرنے کے لیے تیار ہوں۔ علمی زمرے یا مخصوص کتابیں منتخب کریں اور اپنا سوال نیچے لکھیں۔',
          timestamp: new Date().toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' }),
        }
      ],
      categoryIds: [],
      bookIds: [],
      filterType: 'all',
      authorId: '',
      manualMode: 'auto',
    };
    setConversations([newConv, ...conversations]);
    setActiveConversationId(newId);
    setSelectedCategoryIds([]);
    setSelectedBookIds([]);
    setSelectedFilter('all');
    setSelectedAuthorId('');
    setManualMode('auto');
  };

  // Back button functionality
  const handleBack = () => {
    // Starts a fresh clean chat session
    handleNewConversation();
    // Automatically opens the history drawer so they can select past conversations
    setIsHistoryDrawerOpen(true);
  };

  // Delete a past conversation
  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = conversations.filter((c) => c.id !== id);
    setConversations(filtered);
    if (activeConversationId === id && filtered.length > 0) {
      setActiveConversationId(filtered[0].id);
      applyFiltersFromConversation(filtered[0]);
    } else if (filtered.length === 0) {
      // Re-create fallback
      const welcomeId = 'welcome-' + Date.now();
      const welcomeConv: ChatConversation = {
        id: welcomeId,
        title: 'جدید علمی تحقیق',
        messages: [
          {
            id: 'welcome-msg',
            role: 'assistant',
            text: 'میں ایک نیا تحقیقی سیشن شروع کرنے کے لیے تیار ہوں۔ زمرے منتخب کریں اور اپنا سوال نیچے لکھیں۔',
            timestamp: new Date().toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' }),
          }
        ],
        categoryIds: [],
        bookIds: [],
        filterType: 'all',
        authorId: '',
        manualMode: 'auto',
      };
      setConversations([welcomeConv]);
      setActiveConversationId(welcomeId);
    }
  };

  const getActiveConversation = (): ChatConversation | undefined => {
    return conversations.find((c) => c.id === activeConversationId);
  };

  const getActiveFilterSummary = (): string => {
    if (selectedBookIds.length > 0) {
      return `${selectedBookIds.length} کتب`;
    }
    if (selectedCategoryIds.length > 0) {
      return `${selectedCategoryIds.length} زمرے`;
    }
    if (selectedFilter === 'hanafi') return 'حنفی';
    if (selectedFilter === 'usul') return 'اصول';
    if (selectedFilter === 'hadith') return 'حدیث';
    if (selectedFilter === 'tafsir') return 'تفسیر';
    return '';
  };

  // Clickable citation trigger: Scrolls to source card and highlights with a visual golden flash
  const handleCitationClick = (citationNumber: number) => {
    const index = citationNumber - 1; // 1-indexed to 0-indexed
    const element = document.getElementById(`source-idx-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.remove('animate-golden-flash');
      // trigger reflow to reset CSS animation
      void element.offsetWidth;
      element.classList.add('animate-golden-flash');
    }
  };

  // Handle Send Question Trigger
  const handleSend = async (customQuery?: string) => {
    const queryToSend = (customQuery || inputText).trim();
    if (!queryToSend || isSearching) return;

    // Check if public mode requires user key and none is set
    if (authStatus?.requiresUserKey && !userApiKey) {
      setIsApiKeyModalOpen(true);
      return;
    }

    setInputText('');

    const activeConv = getActiveConversation();
    if (!activeConv) return;

    // Create user's message object
    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      text: queryToSend,
      timestamp: new Date().toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' }),
    };

    // Update session title dynamically on first user query
    let updatedTitle = activeConv.title;
    if (activeConv.messages.length <= 1 || activeConv.title === 'نئی علمی تحقیق') {
      updatedTitle = queryToSend.length > 25 ? queryToSend.substring(0, 25) + '...' : queryToSend;
    }

    // Append user message instantly
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConversationId) {
          return {
            ...c,
            title: updatedTitle,
            messages: [...c.messages, userMsg],
          };
        }
        return c;
      })
    );

    setIsSearching(true);

    try {
      // Build history
      const compactHistory = activeConv.messages
        .filter((m) => m.id !== 'welcome-msg' && m.id !== 'welcome-new')
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (userApiKey) {
        headers['x-gemini-api-key'] = userApiKey;
      }

      const response = await fetch('/api/research', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: queryToSend,
          sourceFilter: selectedFilter,
          categoryId: selectedCategoryIds[0],
          categoryIds: selectedCategoryIds,
          bookIds: selectedBookIds,
          authorId: selectedAuthorId,
          manualMode,
          conversationId: activeConversationId,
          history: compactHistory,
          apiKey: userApiKey || undefined,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        if (responseData?.requiresApiKey) {
          setIsApiKeyModalOpen(true);
        }
        throw new Error(responseData?.error || 'تحقیق کے دوران رابطہ منقطع ہو گیا۔ علمی سرور جواب دینے سے قاصر ہے۔');
      }

      const researchResult = responseData as ResearchResponse;

      const assistantMsg: ChatMessage = {
        id: 'assistant-' + Date.now(),
        role: 'assistant',
        text: researchResult.answer?.summary || 'معاف کیجیے گا، نصوص ڈیٹا بیس سے اس مسئلے پر کوئی ٹھوس دلیل دستیاب نہیں ہو سکی۔',
        answer: researchResult.answer,
        sources: researchResult.sources || [],
        debugInfo: researchResult.debugInfo,
        timestamp: new Date().toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' }),
      };

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConversationId) {
            return {
              ...c,
              messages: [...c.messages, assistantMsg],
            };
          }
          return c;
        })
      );
    } catch (err: any) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: 'err-' + Date.now(),
        role: 'assistant',
        text: `⚠️ **تحقیقی نقص**: ${err?.message || 'کلاؤڈ سیشن سے رابطہ منقطع ہو گیا۔ براہ کرم دوبارہ کوشش کریں۔'}`,
        timestamp: new Date().toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' }),
      };
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConversationId) {
            return {
              ...c,
              messages: [...c.messages, errorMsg],
            };
          }
          return c;
        })
      );
    } finally {
      setIsSearching(false);
    }
  };

  const activeConv = getActiveConversation() || conversations[0] || { id: '', title: '', messages: [] };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 antialiased" id="nusus-app-container">
      
      {/* Global Slide-out History Drawer Overlay */}
      {isHistoryDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsHistoryDrawerOpen(false)}
          />
          
          {/* Drawer Body */}
          <div className="relative w-80 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10 border-r border-slate-200 animate-slide-in-right">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between font-urdu">
              <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-800" />
                سابقہ تحقیقات (Past Research)
              </span>
              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border-b border-slate-100">
              <button
                onClick={() => {
                  handleNewConversation();
                  setIsHistoryDrawerOpen(false);
                }}
                className="w-full py-2 rounded-xl bg-emerald-900 hover:bg-emerald-950 text-amber-100 transition-colors flex items-center justify-center gap-1.5 text-xs font-bold font-urdu shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                + نئی تحقیق شروع کریں
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations
                .filter((conv) => conv.messages.some(m => m.role === 'user') || conv.id === activeConversationId)
                .map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => {
                        handleSelectConversation(conv.id);
                        setIsHistoryDrawerOpen(false);
                      }}
                      className={`group w-full text-right dir-rtl p-3 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isActive
                          ? 'bg-emerald-50 border border-emerald-200 shadow-3xs'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate flex-1 font-urdu">
                        <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-800' : 'text-slate-400'}`} />
                        <div className="truncate text-right">
                          <p className={`text-xs font-bold truncate ${isActive ? 'text-emerald-950' : 'text-slate-700'}`}>
                            {conv.title}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            {conv.messages.length} مراسلے
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          className="p-1 rounded-sm text-slate-400 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                          title="سیشن حذف کریں"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 text-center text-[10px] text-slate-400 font-urdu">
              تیار کردہ محمد اویس باجوا
            </div>
          </div>
        </div>
      )}

      {/* Global Slide-out Filter Drawer Overlay */}
      {isFilterDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsFilterDrawerOpen(false)}
          />
          
          {/* Drawer Body */}
          <div className="relative w-96 max-w-[90vw] bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 animate-slide-in-left">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between font-urdu">
              <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-emerald-800" />
                تحقیقی حدود اور کتب فیلٹرز
              </span>
              <button
                onClick={() => setIsFilterDrawerOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <SourceFilter
                selectedFilter={selectedFilter}
                onSelectFilter={setSelectedFilter}
                selectedCategoryIds={selectedCategoryIds}
                onSelectCategoryIds={setSelectedCategoryIds}
                selectedBookIds={selectedBookIds}
                onSelectBookIds={setSelectedBookIds}
                selectedAuthorId={selectedAuthorId}
                onSelectAuthorId={setSelectedAuthorId}
                disabled={isSearching}
              />

              {/* Manual Strategy/Precision Mode Override block */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-urdu text-right">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  تلاش کی حکمتِ عملی (Research Override):
                </label>
                <select
                  value={manualMode}
                  onChange={(e) => setManualMode(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 text-slate-800 text-xs rounded-lg p-2 font-urdu"
                >
                  <option value="auto">خودکار کلاسیفیکیشن (Auto-detect)</option>
                  <option value="exact">عین عبارت کی تلاش (Exact Phrase)</option>
                  <option value="similar">ہم معنی عبارت (Similar Phrase)</option>
                  <option value="conceptual">مفہوم و مسئلہ (Conceptual Search)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  خودکار کلاسیفیکیشن خود ہی سوال کے مزاج کو دیکھ کر Direct Ruling، Term Occurrence یا STORM ریسرچ ماڈل منتخب کرتی ہے۔
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setIsFilterDrawerOpen(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-900 hover:bg-emerald-950 text-amber-100 font-bold font-urdu text-xs cursor-pointer shadow-xs text-center"
              >
                محفوظ کریں اور بند کریں
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Single Chat Frame Container */}
      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-white border-x border-slate-200/80 shadow-xs relative overflow-hidden">
        
        {/* Universal Top Navigation Header */}
        <header className="bg-white border-b border-slate-200/80 sticky top-0 z-10 py-3 px-4 flex items-center justify-between shrink-0 shadow-2xs font-urdu">
          {/* Left Side: Toggle History Drawer or Back Button */}
          {activeConv.messages.filter(m => m.id !== 'welcome-msg' && m.id !== 'welcome-new').length > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              className="px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/60 transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
              title="واپس جائیں"
            >
              <ChevronRight className="w-4 h-4 text-emerald-800 shrink-0" />
              <span>واپس</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsHistoryDrawerOpen(true)}
              className="p-2 rounded-lg hover:bg-slate-50 text-slate-700 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-slate-100"
              title="سابقہ تحقیقات"
            >
              <MessageSquare className="w-4 h-4 text-emerald-800 shrink-0" />
              <span className="hidden md:inline">سابقہ تحقیقات</span>
            </button>
          )}

          {/* Center Title and Scholarly Subtitle Banner */}
          <div className="text-center flex-1 mx-2">
            <h1 className="text-base sm:text-lg font-extrabold text-emerald-950 leading-tight">
              تراث اے آئی (Turath AI)
            </h1>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium leading-tight">
              کلاسیکی اسلامی کتب و فتاویٰ کے ذخیرے سے سمارٹ فقہی و علمی معاون
            </p>
            <p className="text-[9px] text-emerald-800 font-semibold leading-none mt-0.5">
              تیارکردہ: مفتی محمد اویس باجوہ
            </p>
          </div>

          {/* Right Side: Three-dot menu, API key status, and limit filters */}
          <div className="flex items-center gap-1.5 relative">
            {/* API Key / Dev Mode Status Indicator */}
            {authStatus?.isDevMode ? (
              <button
                type="button"
                onClick={() => setIsApiKeyModalOpen(true)}
                className="p-1.5 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80 transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
                title="Google AI Studio ڈویلپر ماحول فعال ہے"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="hidden sm:inline text-[11px]">AI Studio Dev</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsApiKeyModalOpen(true)}
                className={`p-1.5 px-2.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold border ${
                  userApiKey
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200/80'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                }`}
                title={userApiKey ? 'Gemini API Key محفوظ ہے' : 'Gemini API Key درکار ہے'}
              >
                <Key className={`w-3.5 h-3.5 shrink-0 ${userApiKey ? 'text-emerald-700' : 'text-amber-700'}`} />
                <span className="hidden sm:inline text-[11px]">{userApiKey ? 'API Key محفوظ' : 'API Key درج کریں'}</span>
              </button>
            )}

            {/* Quick access Limit Filters */}
            <button
              type="button"
              onClick={() => setIsFilterDrawerOpen(true)}
              className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-100 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="تحقیق کی حدود"
            >
              <SlidersHorizontal className="w-4 h-4 shrink-0 text-emerald-800" />
              <span className="hidden md:inline">حدود و کتب</span>
              {getActiveFilterSummary() && (
                <span className="bg-amber-100 text-amber-950 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {getActiveFilterSummary()}
                </span>
              )}
            </button>

            {/* Three-dot menu Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsThreeDotMenuOpen(!isThreeDotMenuOpen)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition-all cursor-pointer flex items-center justify-center"
                title="مزید آپشنز"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Three-dot menu Dropdown list */}
              {isThreeDotMenuOpen && (
                <>
                  {/* Backdrop click closer */}
                  <div className="fixed inset-0 z-30 animate-none" onClick={() => setIsThreeDotMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-40 py-1 text-right font-urdu">
                    <button
                      onClick={() => {
                        handleNewConversation();
                        setIsThreeDotMenuOpen(false);
                      }}
                      className="w-full text-right px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center justify-between"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-800" />
                      <span>نئی چیٹ</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsHistoryDrawerOpen(true);
                        setIsThreeDotMenuOpen(false);
                      }}
                      className="w-full text-right px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center justify-between border-t border-slate-100"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-800" />
                      <span>سابقہ تحقیقات / چیٹس</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsApiKeyModalOpen(true);
                        setIsThreeDotMenuOpen(false);
                      }}
                      className="w-full text-right px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center justify-between border-t border-slate-100"
                    >
                      <Key className="w-3.5 h-3.5 text-emerald-800" />
                      <span>Gemini API Key سیٹنگز</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsFilterDrawerOpen(true);
                        setIsThreeDotMenuOpen(false);
                      }}
                      className="w-full text-right px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center justify-between border-t border-slate-100"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-800" />
                      <span>زمرہ جات</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsFilterDrawerOpen(true);
                        setIsThreeDotMenuOpen(false);
                      }}
                      className="w-full text-right px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center justify-between border-t border-slate-100"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-emerald-800" />
                      <span>کتب فیلٹر</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsFilterDrawerOpen(true);
                        setIsThreeDotMenuOpen(false);
                      }}
                      className="w-full text-right px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center justify-between border-t border-slate-100"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-800" />
                      <span>ترتیبات (Strategies)</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowAboutModal(true);
                        setIsThreeDotMenuOpen(false);
                      }}
                      className="w-full text-right px-4 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center justify-between border-t border-slate-100"
                    >
                      <Info className="w-3.5 h-3.5 text-emerald-800" />
                      <span>معلومات (About)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Workspace Tab Bar */}
        <div className="bg-slate-100/90 border-b border-slate-200/80 px-4 py-2 flex items-center justify-between shrink-0 font-urdu dir-rtl">
          <div className="flex gap-2 overflow-x-auto w-full scrollbar-none">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-emerald-900 text-amber-50 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span>مکالماتی تحقیق (Chat)</span>
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'search'
                  ? 'bg-emerald-900 text-amber-50 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span>عمومی تلاش (Search)</span>
            </button>

            <button
              onClick={() => setActiveTab('reader')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'reader'
                  ? 'bg-emerald-900 text-amber-50 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>مطالعہ کتب (Book Reader)</span>
            </button>

            <button
              onClick={() => setActiveTab('translator')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'translator'
                  ? 'bg-emerald-900 text-amber-50 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Languages className="w-3.5 h-3.5 shrink-0" />
              <span>فقہی ترجمہ کار (Translator)</span>
            </button>
          </div>
        </div>

        {/* Central Stage */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 overflow-hidden relative">
          
          {activeTab === 'search' ? (
            <SearchMode onOpenBook={handleOpenBookInReader} />
          ) : activeTab === 'reader' ? (
            <BookReader
              initialBookId={readerBookId}
              initialPageNumber={readerPageNumber}
              onTranslateText={handleTranslateInPanel}
            />
          ) : activeTab === 'translator' ? (
            <TranslationTool
              initialText={translatorInitialText}
              onRequestApiKey={() => setIsApiKeyModalOpen(true)}
            />
          ) : (
            // Chat & Research Pipeline Tab
            activeConv.messages.length <= 1 ? (
              // 1. CENTERED WELCOME SCREEN
              <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6 md:p-8 max-w-2xl mx-auto text-center space-y-6 overflow-y-auto w-full">
                
                {/* Header Title block */}
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-extrabold font-urdu text-emerald-950 flex items-center justify-center gap-2">
                    <span>تراث اے آئی</span>
                    <span className="text-sm font-normal text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">Turath AI</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-urdu max-w-lg mx-auto">
                    کلاسیکی اسلامی کتب، فتاویٰ اور تفاسیر کے ذخیرے سے سمارٹ فقہی و علمی معاون
                  </p>
                  <p className="text-xs text-emerald-800 font-urdu font-semibold">
                    تیارکردہ: مفتی محمد اویس باجوہ
                  </p>
                </div>

                {/* Large Central Elegant Chat Box */}
                <div className="w-full bg-white rounded-2xl border border-emerald-900/15 shadow-sm p-4 space-y-3 text-right">
                  <div className="flex items-center justify-between font-urdu text-xs pb-1 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsFilterDrawerOpen(true)}
                      className="flex items-center gap-1.5 text-emerald-900 hover:text-emerald-950 font-bold px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 animate-pulse text-emerald-800" />
                      <span>کتب اور حدود فیلٹرز منتخب کریں</span>
                      {getActiveFilterSummary() && (
                        <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded-full font-bold text-[10px] mr-1">
                          {getActiveFilterSummary()}
                        </span>
                      )}
                    </button>

                    <span className="text-slate-500">اپنا فقہی یا تحقیقی سوال یہاں لکھیں...</span>
                  </div>

                  <textarea
                    rows={5}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="مثال: مسافر کے لیے قصر نماز کی مسافت اور اس کی شرائط کیا ہیں؟"
                    className="w-full bg-transparent text-right dir-rtl py-2 text-base text-slate-800 font-urdu focus:outline-none resize-none leading-relaxed"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => handleSend()}
                      disabled={isSearching || !inputText.trim()}
                      className={`px-5 py-2.5 rounded-xl text-sm font-urdu font-bold transition-all flex items-center gap-2 ${
                        inputText.trim() && !isSearching
                          ? 'bg-emerald-900 text-amber-100 hover:bg-emerald-950 hover:scale-102 active:scale-98 shadow-md cursor-pointer'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Send className="w-4 h-4 transform rotate-180 shrink-0" />
                      <span>تحقیق شروع کریں</span>
                    </button>

                    <span className="text-[10px] text-slate-400 font-urdu">
                      تمام جوابات مستند کلاسیکی فقہی کتب سے ماخوذ ہیں
                    </span>
                  </div>
                </div>

                {/* Suggestions Panel */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-urdu">
                  <button
                    type="button"
                    onClick={() => handleSend('مسافر کے لیے قصر نماز کی مسافت کتنی ہے؟')}
                    className="p-3 rounded-xl bg-white hover:bg-emerald-50/50 text-right border border-slate-200/80 hover:border-emerald-200 transition-all cursor-pointer shadow-3xs"
                  >
                    <span className="block font-bold text-xs text-emerald-950 mb-1">مسافر کی نماز</span>
                    <span className="text-slate-500 text-xs line-clamp-2">مسافر کے لیے قصر نماز کی مسافت کتنی ہے؟</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('زکوٰۃ کے نصاب میں چاندی کی مقدار کیا ہے؟')}
                    className="p-3 rounded-xl bg-white hover:bg-emerald-50/50 text-right border border-slate-200/80 hover:border-emerald-200 transition-all cursor-pointer shadow-3xs"
                  >
                    <span className="block font-bold text-xs text-emerald-950 mb-1">زکوٰۃ کا نصاب</span>
                    <span className="text-slate-500 text-xs line-clamp-2">زکوٰۃ کے نصاب میں چاندی کی مقدار کیا ہے؟</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('بیع سلم کی تعریف اور شرائط کیا ہیں؟')}
                    className="p-3 rounded-xl bg-white hover:bg-emerald-50/50 text-right border border-slate-200/80 hover:border-emerald-200 transition-all cursor-pointer shadow-3xs"
                  >
                    <span className="block font-bold text-xs text-emerald-950 mb-1">بیع سلم</span>
                    <span className="text-slate-500 text-xs line-clamp-2">بیع سلم کی تعریف اور شرائط کیا ہیں؟</span>
                  </button>
                </div>
              </div>
            ) : (
              // 2. ACTIVE CHAT TIMELINE SCREEN
              <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
                
                {/* Thread list */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                  {activeConv.messages.map((msg, index) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id || index}
                        className={`flex gap-3 max-w-4xl w-full mx-auto ${
                          isUser ? 'justify-start' : 'justify-start flex-row-reverse'
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold shadow-xs ${
                            isUser
                              ? 'bg-amber-100 text-amber-900 border border-amber-200'
                              : 'bg-emerald-800 text-amber-50 border border-emerald-950'
                          }`}
                        >
                          {isUser ? 'م' : 'ن'}
                        </div>

                        {/* Content Bubble */}
                        <div className="flex-1 space-y-1.5 text-right dir-rtl max-w-3xl">
                          <div className="flex items-center gap-2 justify-start flex-row-reverse">
                            <span className="text-2xs font-mono text-slate-400">
                              {msg.timestamp}
                            </span>
                            <span className="text-[11px] font-bold text-slate-600 font-urdu">
                              {isUser ? 'سائل (User)' : 'معاون نصوص (Nusus AI)'}
                            </span>
                          </div>

                          <div
                            className={`p-4 rounded-2xl border text-slate-800 shadow-3xs leading-relaxed font-urdu text-right dir-rtl ${
                              isUser
                                ? 'bg-amber-50/30 border-amber-100 text-amber-950'
                                : 'bg-white border-slate-200/80 text-slate-900'
                            }`}
                          >
                            {!isUser && msg.sources && msg.sources.length > 0 ? (
                              <AnswerView
                                data={{
                                  answer: msg.answer || { summary: msg.text, detail: msg.text, insufficient: false },
                                  sources: msg.sources,
                                  question: activeConv.title,
                                }}
                                onCitationClick={handleCitationClick}
                                onOpenBook={handleOpenBookInReader}
                              />
                            ) : (
                              <div className="whitespace-pre-line text-sm sm:text-base leading-relaxed">
                                {msg.text}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {isSearching && (
                    <div className="max-w-4xl w-full mx-auto flex gap-3 justify-start flex-row-reverse">
                      <div className="w-8 h-8 rounded-full bg-emerald-800 text-amber-50 shrink-0 flex items-center justify-center text-xs font-bold animate-pulse">
                        ن
                      </div>
                      <div className="flex-1 space-y-1">
                        <span className="text-2xs font-mono text-slate-400">تحقیقی مرحلہ...</span>
                        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-3xs text-right dir-rtl">
                          <LoadingState progressStep="analyzing" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Anchored bottom input block */}
                <div className="p-4 border-t border-slate-200 bg-white shadow-lg shrink-0">
                  <div className="max-w-3xl w-full mx-auto space-y-2">
                    <div className="flex items-center justify-between font-urdu text-xs text-slate-500 px-1">
                      <button
                        type="button"
                        onClick={() => setIsFilterDrawerOpen(true)}
                        className="flex items-center gap-1.5 text-emerald-900 hover:text-emerald-950 font-bold px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-800" />
                        <span>کتب اور حدود فیلٹرز</span>
                        {getActiveFilterSummary() && (
                          <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded-full font-bold text-[10px] mr-1">
                            {getActiveFilterSummary()}
                          </span>
                        )}
                      </button>
                      <span className="text-2xs font-mono text-slate-400">
                        تحقیقی موڈ: {manualMode === 'auto' ? 'خودکار' : manualMode === 'exact' ? 'عین عبارت' : manualMode === 'similar' ? 'ہم معنی' : 'مفہوم'}
                      </span>
                    </div>

                    <div className="relative flex items-end border border-emerald-800/20 rounded-xl p-2 bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-700 focus-within:border-emerald-700 transition-all shadow-inner">
                      <button
                        onClick={() => handleSend()}
                        disabled={isSearching || !inputText.trim()}
                        className={`p-2.5 rounded-lg shrink-0 transition-all ${
                          inputText.trim() && !isSearching
                            ? 'bg-emerald-900 text-amber-100 hover:bg-emerald-950 hover:scale-105 active:scale-95 shadow-md cursor-pointer'
                            : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        <Send className="w-4 h-4 transform rotate-180" />
                      </button>

                      <textarea
                        rows={Math.min(5, inputText.split('\n').length || 1)}
                        disabled={isSearching}
                        placeholder="مزید سوال پوچھیں یا وضاحت طلب کریں... (مثال: اس میں شافعی کتب کی عبارتیں بھی دیں)"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        className="flex-1 bg-transparent text-right dir-rtl px-3 py-1 text-sm sm:text-base text-slate-800 font-urdu focus:outline-none resize-none leading-relaxed"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

        </div>
      </div>

      {/* About Modal Dialog */}
      {showAboutModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-urdu">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden text-right">
            <div className="bg-emerald-900 text-amber-50 p-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="text-amber-100 hover:text-white p-1 rounded-lg hover:bg-emerald-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-bold">تراث اے آئی (Turath AI) کے بارے میں</h3>
            </div>
            
            <div className="p-6 space-y-4 text-slate-700 leading-relaxed text-sm">
              <p>
                <strong>تراث اے آئی (Turath AI)</strong> ایک جدید سمارٹ فقہی اور تحقیقی نظام ہے جو اسلامی تراث، کتبِ فتاویٰ، شروحِ حدیث اور تفاسیر کی مستند کتب کے ذخیرے سے علمی رہنمائی، تخریج اور تقابلی جائزے فراہم کرتا ہے۔
              </p>
              
              <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl space-y-1 text-emerald-950 text-xs">
                <p><strong>بنیادی خصوصیات:</strong></p>
                <ul className="list-disc list-inside space-y-1 mr-4">
                  <li>کلاسیکی عربی نصوص سے براہِ راست تقابلی استدلال</li>
                  <li>تمام ائمہ اور فقہی مکاتبِ فکر (حنفی، مالکی، شافعی، حنبلی) کی کتب کی چھان بین</li>
                  <li>جامع علمی خلاصہ، اصل عبارتیں، جلد و صفحہ نمبر اور مستند لنکس</li>
                  <li>عربی سے اردو فقہی اصطلاحی ترجمہ ٹول</li>
                </ul>
              </div>

              <div className="text-xs text-slate-600 border-t border-slate-100 pt-3 flex items-center justify-between">
                <div>تیارکردہ: <strong className="text-emerald-900">مفتی محمد اویس باجوہ</strong></div>
                <div className="font-mono text-slate-400">ورژن: 2.2.0 (Vercel Edition)</div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3 flex justify-start">
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="px-4 py-2 bg-emerald-900 hover:bg-emerald-950 text-amber-50 font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                ٹھیک ہے
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini API Key Management Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        currentKey={userApiKey}
        onSaveKey={handleSaveUserKey}
        onRemoveKey={handleRemoveUserKey}
        isDevMode={!!authStatus?.isDevMode}
      />
    </div>
  );
}
