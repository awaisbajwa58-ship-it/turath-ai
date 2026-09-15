import { SourceCitation, EvidenceLevel, ResearchMode } from '../../src/types.js';

export interface LLMAnalysisResult {
  mainSubject: string;
  domain: string;
  claim: string;
  requestedMadhhab?: string;
  isComparative: boolean;
  subQuestions?: string[];
  structuredAnalysis?: {
    topic: string;
    subject: string;
    action: string;
    person: string;
    condition: string;
    circumstance: string;
    requested_ruling: string;
    requested_information: string;
    madhhab: string;
    category: string;
    selected_books: string[];
    selected_authors: string[];
    search_intent: string;
    exclusions: string[];
    key_concepts: string[];
    Arabic_terms: string[];
    synonyms: string[];
  };
  queries: {
    exact?: string[];
    terminology?: string[];
    classicalArabic?: string[];
    synonyms?: string[];
    conceptual?: string[];
    reformulated?: string[];
    opposing?: string[];
  };
  researchPlan?: {
    research_level: number;
    search_tasks: string[];
    required_evidence_types: string[];
    required_conditions: string[];
    required_exceptions: string[];
  };
}

export interface LLMProvider {
  analyzeQuestion(
    question: string,
    filter: string,
    mode: ResearchMode,
    apiKey?: string
  ): Promise<LLMAnalysisResult | null>;

  synthesizeAnswer(
    userQuestion: string,
    passages: SourceCitation[],
    isComparative?: boolean,
    apiKey?: string
  ): Promise<{
    summary: string;
    detail: string;
    istidlal_arabic: string;
    insufficient: boolean;
  }>;
}

export interface EmbeddingProvider {
  getEmbedding(text: string): Promise<number[] | null>;
  computeCosineSimilarity(vecA: number[], vecB: number[]): number;
}

export interface CandidatePassage {
  citation: SourceCitation;
  passageText: string;
  bookTitle: string;
  authorName: string;
  categoryId?: string;
  bookId: string | number;
}

export interface RerankedPassage {
  citation: SourceCitation;
  score: number;
  semanticSimilarity: number;
  evidenceLevel: EvidenceLevel;
  evidenceLabelUrdu: string;
  rejectionReason?: string;
}

export interface RerankerProvider {
  rerank(
    userQuestion: string,
    questionConcepts: string[],
    candidates: CandidatePassage[],
    options?: {
      isHanafiRestricted?: boolean;
      selectedBookIds?: string[];
      selectedAuthorId?: string;
      isOpposingRequested?: boolean;
    }
  ): Promise<RerankedPassage[]>;
}

export interface TurathProvider {
  search(query: string, options?: any): Promise<any>;
  retrieve(query: string, options?: any): Promise<any>;
  getPage(bookId: number | string, pageNumber: number): Promise<any>;
  getBookInfo(bookId: number | string): Promise<any>;
  getAuthor(authorId: number | string): Promise<any>;
  listCategories(): Promise<any>;
  findBooks(query: string, options?: any): Promise<any>;
  findAuthors(query: string, options?: any): Promise<any>;
}
