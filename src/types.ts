/**
 * Types for Fiqhi Research Assistant (فقہی تحقیقی معاون)
 */

export type SourceFilterType = 'all' | 'hanafi' | 'hadith' | 'tafsir' | 'usul' | 'custom';

export type ResearchMode = 'auto' | 'exact' | 'similar' | 'semantic' | 'conclusion';

export type EvidenceLevel =
  | 'DIRECT'
  | 'SUPPORTING'
  | 'INDIRECT'
  | 'POSSIBLE_INFERENCE'
  | 'INSUFFICIENT';

export interface SourceFilterOption {
  id: SourceFilterType;
  labelUrdu: string;
  labelArabic: string;
  categoryId?: string;
}

export interface CatalogCategory {
  id: string;
  title: string;
  bookCount: number;
}

export interface CatalogBook {
  id: string;
  title: string;
  author?: { id?: string; name: string };
  category?: { id?: string; title?: string };
}

export interface CatalogAuthor {
  id: string;
  name: string;
}

export interface ResearchRequest {
  question: string;
  sourceFilter?: SourceFilterType;
  categoryId?: string;
  categoryIds?: string[];
  bookIds?: string[];
  authorId?: string;
  manualMode?: ResearchMode;
  conversationId?: string;
  history?: any[];
}

export interface SourceCitation {
  book_id: string | number;
  book: string;
  author: string;
  locator: string; // e.g. "ج 1، ص 187، صفحة تراث 185"
  page: number; // printed or internal page number
  internalPage?: number;
  printedPage?: number;
  vol?: string;
  arabic_text: string;
  original_arabic_verbatim?: string;
  url: string; // Direct link to turath.io
  shamela_url?: string;
  headings?: string[];
  citation?: string; // Full Nusus formatted citation string
  score?: number;
  similarity_score?: number;
  category_id?: string;
  author_id?: string | number;
  evidence_level?: EvidenceLevel;
  evidence_label_urdu?: string;
  madhhab?: string;
}

export interface ResearchAnswer {
  summary: string; // Direct answer
  detail: string;  // Detailed explanation, Arabic quotes, translations & references
  istidlal_arabic?: string; // Exact key Arabic clause
  insufficient: boolean;
  research_mode_used?: ResearchMode;
  research_mode_label_urdu?: string;
  evidenceAnalysis?: any[];
  finalResearchAssessment?: any;
}

export interface DebugInfo {
  originalQuestion: string;
  selectedMode?: ResearchMode;
  detectedMode?: ResearchMode;
  detectedIntent?: {
    keywords: string[];
    language: string;
    targetFilter: SourceFilterType;
    domain?: string;
    mainSubject?: string;
    claim?: string;
    isOpposingRequested?: boolean;
    isComparative?: boolean;
    madhhabs?: string[];
  };
  generatedQueries: string[];
  rejectedQueries?: Array<{
    query: string;
    reason: string;
  }>;
  queriesUsed: string[];
  rawHitsCount: number;
  scoredPassagesCount: number;
  evidenceCounts?: Record<string, number>;
  selectedPassages: Array<{
    book: string;
    score: number;
    similarityScore?: number;
    evidenceLevel?: EvidenceLevel;
    evidenceLabelUrdu?: string;
    locator: string;
    url: string;
  }>;
  rejectedSources?: Array<{
    book: string;
    reason: string;
  }>;
  modelsAttempted: string[];
}

export interface ResearchResponse {
  question: string;
  answer: ResearchAnswer;
  sources: SourceCitation[];
  queriesUsed?: string[];
  debugInfo?: DebugInfo;
  error?: string;
}

export interface QuickQuestion {
  title: string;
  question: string;
  category: SourceFilterType;
  categoryId?: string;
}

export type PipelineStep =
  | 'idle'
  | 'analyzing'
  | 'searching'
  | 'ranking'
  | 'synthesizing'
  | 'complete'
  | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  answer?: ResearchAnswer;
  sources?: SourceCitation[];
  debugInfo?: DebugInfo;
  isSearching?: boolean;
  timestamp: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  categoryIds: string[];
  bookIds: string[];
  filterType: SourceFilterType;
  authorId: string;
  manualMode: ResearchMode;
}
