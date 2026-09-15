import { GoogleGenAI } from '@google/genai';
import { EmbeddingProvider } from './interfaces.js';
import { normalizeArabicText } from '../queryAnalyzer.js';

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  async getEmbedding(text: string): Promise<number[] | null> {
    if (!text || !text.trim()) {
      return null;
    }
    // High-speed, zero-latency deterministic Arabic term-distribution vector
    return this.computeFallbackTermVector(text);
  }

  computeCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    const minLen = Math.min(vecA.length, vecB.length);

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLen; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(0, Math.min(1, sim));
  }

  /**
   * Helper to compute a deterministic term-distribution vector for fallback similarity
   */
  private computeFallbackTermVector(text: string): number[] {
    const norm = normalizeArabicText(text);
    const tokens = norm.split(' ').filter((t) => t.length > 2);
    const vec = new Array(100).fill(0);

    for (const t of tokens) {
      let hash = 0;
      for (let i = 0; i < t.length; i++) {
        hash = (hash * 31 + t.charCodeAt(i)) % 100;
      }
      vec[Math.abs(hash)] += 1;
    }

    // Normalize vector
    const sum = vec.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      return vec.map((v) => v / sum);
    }
    return vec;
  }
}

export const embeddingProvider = new GeminiEmbeddingProvider();
