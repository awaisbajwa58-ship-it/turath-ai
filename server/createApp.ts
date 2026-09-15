import express from 'express';
import dotenv from 'dotenv';
import { executeResearchPipeline } from './searchService.js';
import { ResearchRequest } from '../src/types.js';

dotenv.config();

let turathClient: any = null;
async function getTurathClient() {
  if (!turathClient) {
    const nususTurath = await import('nusus/turath');
    turathClient = nususTurath.createTurathClient({ timeout: 15_000 });
  }
  return turathClient;
}

export async function createApp() {
  const app = express();

  app.use(express.json({ limit: '5mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'تراث اے آئی (Turath AI)',
      author: 'مفتی محمد اویس باجوہ (Mufti Muhammad Awais Bajwa)',
      time: new Date().toISOString(),
    });
  });

  // Auth and Environment Status endpoint (Bring Your Own Key)
  app.get('/api/config/auth-status', async (req, res) => {
    try {
      const { getAuthStatus } = await import('./apiKeyManager.js');
      const status = getAuthStatus(req);
      res.json(status);
    } catch (err: any) {
      res.json({
        isDevMode: false,
        hasServerKey: false,
        requiresUserKey: true,
        environmentName: 'Public / Bring-Your-Own-Key',
      });
    }
  });

  // Validate API Key endpoint
  app.post('/api/config/validate-key', async (req, res) => {
    try {
      const { apiKey } = req.body;
      const { validateGeminiKey } = await import('./apiKeyManager.js');
      const result = await validateGeminiKey(apiKey);
      res.json(result);
    } catch (err: any) {
      res.json({ valid: false, error: err.message || 'Key validation failed' });
    }
  });

  // Dynamic Nusus Catalog - Categories Endpoint
  app.get('/api/catalog/categories', async (_req, res) => {
    try {
      const turath = await getTurathClient();
      const categories = await turath.listCategories();
      res.json({ categories });
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      res.status(500).json({ error: err?.message || 'Failed to fetch catalog categories' });
    }
  });

  // Dynamic Nusus Catalog - Books Endpoint
  app.get('/api/catalog/books', async (req, res) => {
    try {
      const turath = await getTurathClient();
      const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
      const categoryIdsStr = req.query.categoryIds ? String(req.query.categoryIds) : undefined;
      const query = req.query.query ? String(req.query.query) : '';

      const options: any = { limit: 8000 };
      if (categoryIdsStr) {
        options.categoryIds = categoryIdsStr.split(',').filter(Boolean);
      } else if (categoryId) {
        options.categoryIds = [categoryId];
      }
      const books = await turath.findBooks(query, options);
      res.json({ books });
    } catch (err: any) {
      console.error('Error fetching books:', err);
      res.status(500).json({ error: err?.message || 'Failed to fetch catalog books' });
    }
  });

  // Dynamic Nusus Catalog - Authors Endpoint
  app.get('/api/catalog/authors', async (req, res) => {
    try {
      const turath = await getTurathClient();
      const query = req.query.query ? String(req.query.query) : '';
      const authors = await turath.findAuthors(query, { limit: 100 });
      res.json({ authors });
    } catch (err: any) {
      console.error('Error fetching authors:', err);
      res.status(500).json({ error: err?.message || 'Failed to fetch catalog authors' });
    }
  });

  // Book Reader - Fetch Specific Page
  app.get('/api/book/page', async (req, res) => {
    try {
      const bookId = req.query.bookId ? String(req.query.bookId) : '';
      const pageNumber = req.query.page ? Number(req.query.page) : 1;
      if (!bookId) {
        return res.status(400).json({ error: 'Book ID is required' });
      }
      const { turathProvider } = await import('./providers/turathProvider.js');
      const pageData = await turathProvider.getPage(bookId, pageNumber);
      res.json({ page: pageData });
    } catch (err: any) {
      console.error('Error fetching page:', err);
      res.status(500).json({ error: err?.message || 'Failed to fetch book page' });
    }
  });

  // Book Reader - Fetch Book Info
  app.get('/api/book/info', async (req, res) => {
    try {
      const bookId = req.query.bookId ? String(req.query.bookId) : '';
      if (!bookId) {
        return res.status(400).json({ error: 'Book ID is required' });
      }
      const { turathProvider } = await import('./providers/turathProvider.js');
      const bookInfo = await turathProvider.getBookInfo(bookId);
      res.json({ book: bookInfo });
    } catch (err: any) {
      console.error('Error fetching book info:', err);
      res.status(500).json({ error: err?.message || 'Failed to fetch book info' });
    }
  });

  // General Search Mode - Literal occurrences
  app.get('/api/search/literal', async (req, res) => {
    try {
      const query = req.query.query ? String(req.query.query) : '';
      const bookIdsStr = req.query.bookIds ? String(req.query.bookIds) : '';
      const categoryIdsStr = req.query.categoryIds ? String(req.query.categoryIds) : '';
      
      if (!query.trim()) {
        return res.json({ results: [] });
      }

      const { turathProvider } = await import('./providers/turathProvider.js');
      
      const options: any = {
        maxPassages: 25,
        maxCharsPerPassage: 1500,
      };

      const scope: any = {};
      if (bookIdsStr) {
        scope.bookIds = bookIdsStr.split(',').map(Number).filter(Boolean);
      }
      if (categoryIdsStr) {
        scope.categoryIds = categoryIdsStr.split(',').map(Number).filter(Boolean);
      }
      if (Object.keys(scope).length > 0) {
        options.scope = scope;
      }

      const fetchPassages = async (singleOptions: any): Promise<any[]> => {
        try {
          const retrieveRes = await turathProvider.retrieve(query.trim(), singleOptions);
          if (retrieveRes?.passages && retrieveRes.passages.length > 0) {
            return retrieveRes.passages;
          }
        } catch (err) {
          // ignore
        }
        return [];
      };

      let passages = await fetchPassages(options);

      if (passages.length === 0 && (options.scope?.bookIds || options.scope?.categoryIds)) {
        passages = await fetchPassages({
          maxPassages: 25,
          maxCharsPerPassage: 1500,
        });
      }

      const results = passages.map((p: any) => ({
        bookId: p.book?.id,
        bookTitle: p.book?.title || 'كتاب غير مسمى',
        authorName: p.author?.name || 'مصنف غير معروف',
        pageNumber: p.location?.printedPage || p.location?.internalPage || 1,
        internalPage: p.location?.internalPage || 1,
        printedPage: p.location?.printedPage,
        volume: p.location?.volume,
        snippet: p.text || '',
        headings: p.headings || [],
        url: p.url || `https://app.turath.io/book/${p.book?.id}?page=${p.location?.internalPage || 1}`,
      }));

      res.json({ results });
    } catch (err: any) {
      console.error('Error in literal search:', err);
      res.status(500).json({ error: err?.message || 'Failed to search corpus' });
    }
  });

  // Technical Fiqh Translator - Arabic to Urdu via Gemini
  app.post('/api/translate', async (req, res) => {
    try {
      const { text, style = 'balanced' } = req.body;
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'Text is required for translation' });
      }

      const { resolveApiKey } = await import('./apiKeyManager.js');
      const userKeyHeader = req.headers['x-gemini-api-key'] as string | undefined;
      const apiKey = resolveApiKey(userKeyHeader || req.body.apiKey, req);

      if (!apiKey) {
        return res.status(400).json({
          error: 'Gemini API Key درکار ہے۔ برائے مہربانی اپنی Gemini API Key درج کریں۔',
          requiresApiKey: true,
        });
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const candidateModels = Array.from(
        new Set(
          [
            process.env.AI_MODEL,
            'gemini-3.6-flash',
            'gemini-3.5-flash',
            'gemini-3.7-flash',
            'gemini-3.1-flash-lite',
            'gemini-flash-latest',
          ]
            .filter(Boolean)
            .map((m) => (m!.startsWith('models/') ? m!.substring(7) : m!))
        )
      );
      
      let stylePrompt = '';
      if (style === 'literal') {
        stylePrompt = 'Provide a word-for-word, highly literal Arabic to Urdu translation (لفظی ترجمہ) preserving syntactic structures exactly.';
      } else if (style === 'idiomatic') {
        stylePrompt = 'Provide a beautiful, highly idiomatic and literary Urdu translation (بامحاورہ اور ادبی ترجمہ) that sounds elegant and fluent to native Urdu scholars.';
      } else {
        stylePrompt = 'Provide a balanced translation (بامحاورہ اور علمی ترجمہ) that maintains exact technical juristic definitions and terms (فقہی اصطلاحات) while ensuring clear, accessible scholarly Urdu grammar.';
      }

      const systemInstruction = `You are an expert Islamic Jurisprudence translator specializing in Classical Arabic to Urdu scholarly translation.
Your task is to translate the user's classical Arabic text into beautiful, accurate Urdu.
Guidelines:
1. ${stylePrompt}
2. Maintain the sanctity and accurate Islamic terminology (e.g. do not mistranslate words like "صاع", "مد", "دم", "طیب", "حدث", "جنابت"). Keep these terms intact with brief parenthetical Urdu explanations if needed.
3. Keep the translation pure and academic. Do not add conversational fillers, greetings, or meta-commentary (like "Here is your translation:").
4. Output ONLY the translated Urdu text.`;

      let translatedText = '';
      let lastError: any = null;

      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: text.trim(),
            config: {
              systemInstruction,
              temperature: 0.2,
            },
          });
          if (response?.text) {
            translatedText = response.text.trim();
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[Translator] Model ${model} failed, attempting next:`, err?.message || err);
        }
      }

      if (!translatedText && lastError) {
        throw lastError;
      }

      res.json({ translation: translatedText });
    } catch (err: any) {
      console.error('Error in translator:', err);
      res.status(500).json({ error: err?.message || 'Failed to translate text' });
    }
  });

  // Main Research API Pipeline
  app.post('/api/research', async (req, res) => {
    try {
      const {
        question,
        sourceFilter = 'all',
        categoryId,
        categoryIds,
        bookIds,
        authorId,
        manualMode,
        conversationId,
        history,
      }: ResearchRequest = req.body;

      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({
          error: 'براہ کرم اپنا سوال درج کریں۔',
        });
      }

      const { resolveApiKey } = await import('./apiKeyManager.js');
      const userKeyHeader = req.headers['x-gemini-api-key'] as string | undefined;
      const apiKey = resolveApiKey(userKeyHeader || (req.body as any).apiKey, req);

      if (!apiKey) {
        return res.status(400).json({
          error: 'Gemini API Key درکار ہے۔ برائے مہربانی اپنی Gemini API Key درج کریں۔',
          requiresApiKey: true,
        });
      }

      const trimmedQuestion = question.trim();
      console.log(
        `[Research Request] Question: "${trimmedQuestion}", Filter: ${sourceFilter}, Mode: ${manualMode}`
      );

      const response = await executeResearchPipeline(trimmedQuestion, sourceFilter, {
        categoryId,
        categoryIds,
        bookIds,
        authorId,
        manualMode,
        conversationId,
        history,
        apiKey,
      });

      return res.json(response);
    } catch (error: any) {
      console.error('Error in /api/research endpoint:', error);
      return res.status(500).json({
        error: error.message || 'تحقیق کے دوران سرور پر کچھ خرابی پیش آئی۔',
      });
    }
  });

  return app;
}
