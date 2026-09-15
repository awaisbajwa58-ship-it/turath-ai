import { TurathProvider } from './interfaces.js';

let turathClientInstance: any = null;

async function getTurathClient() {
  if (!turathClientInstance) {
    const nususTurath = await import('nusus/turath');
    // Set optimized client timeout
    turathClientInstance = nususTurath.createTurathClient({ timeout: 12_000 });
  }
  return turathClientInstance;
}

/**
 * Lightweight, dependency-free Concurrency Limiter
 * Enforces a maximum number of parallel requests to avoid overloading the API
 */
class ConcurrencyLimiter {
  private activeCount = 0;
  private queue: (() => void)[] = [];
  constructor(private maxConcurrency: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// Allow up to 6 concurrent calls to Turath APIs for fast parallel search
const limiter = new ConcurrencyLimiter(6);

/**
 * Retries a promise-returning function with exponential backoff and jitter
 */
async function retryWithBackoff<T>(
  operation: string,
  fn: () => Promise<T>,
  retries = 2,
  initialDelay = 800
): Promise<T> {
  let lastError: any = null;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isTimeout = String(err).includes('timed out') || String(err).includes('timeout');
      const isJsonErr = String(err).includes('JSON') || String(err).includes('invalid');
      
      console.warn(
        `[TurathProvider] "${operation}" attempt ${attempt} failed (Timeout: ${isTimeout}, JSON error: ${isJsonErr}):`,
        err?.message || String(err)
      );

      if (attempt === retries) {
        break;
      }

      // Exponential backoff with some random jitter (between 0.8 and 1.2)
      const jitter = 0.8 + Math.random() * 0.4;
      const waitTime = Math.floor(delay * jitter);
      
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      delay *= 2;
    }
  }

  throw lastError;
}

export class DefaultTurathProvider implements TurathProvider {
  async search(query: string, options?: any): Promise<any> {
    return limiter.run(() =>
      retryWithBackoff(`Search: ${query.substring(0, 20)}`, async () => {
        const client = await getTurathClient();
        if (typeof client.search === 'function') {
          return client.search(query, options);
        }
        return client.retrieve(query, options);
      })
    );
  }

  async retrieve(query: string, options?: any): Promise<any> {
    return limiter.run(() =>
      retryWithBackoff(`Retrieve: ${query.substring(0, 20)}`, async () => {
        const client = await getTurathClient();
        return client.retrieve(query, options);
      })
    );
  }

  async getPage(bookId: number | string, pageNumber: number): Promise<any> {
    return limiter.run(() =>
      retryWithBackoff(`GetPage Book:${bookId} Page:${pageNumber}`, async () => {
        const client = await getTurathClient();
        if (typeof client.getPage === 'function') {
          return client.getPage(bookId, pageNumber);
        }
        return null;
      })
    );
  }

  async getBookInfo(bookId: number | string): Promise<any> {
    return limiter.run(() =>
      retryWithBackoff(`GetBookInfo Book:${bookId}`, async () => {
        const client = await getTurathClient();
        if (typeof client.getBookInfo === 'function') {
          return client.getBookInfo(bookId);
        }
        return null;
      })
    );
  }

  async getAuthor(authorId: number | string): Promise<any> {
    return limiter.run(() =>
      retryWithBackoff(`GetAuthor Author:${authorId}`, async () => {
        const client = await getTurathClient();
        if (typeof client.getAuthor === 'function') {
          return client.getAuthor(authorId);
        }
        return null;
      })
    );
  }

  async listCategories(): Promise<any> {
    return limiter.run(() =>
      retryWithBackoff('ListCategories', async () => {
        const client = await getTurathClient();
        return client.listCategories();
      })
    );
  }

  async findBooks(query: string, options?: any): Promise<any> {
    return limiter.run(() =>
      retryWithBackoff(`FindBooks: ${query.substring(0, 20)}`, async () => {
        const client = await getTurathClient();
        return client.findBooks(query, options);
      })
    );
  }

  async findAuthors(query: string, options?: any): Promise<any> {
    return limiter.run(() =>
      retryWithBackoff(`FindAuthors: ${query.substring(0, 20)}`, async () => {
        const client = await getTurathClient();
        return client.findAuthors(query, options);
      })
    );
  }
}

export const turathProvider = new DefaultTurathProvider();
