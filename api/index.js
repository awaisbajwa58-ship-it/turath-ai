var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/providers/turathProvider.ts
var turathProvider_exports = {};
__export(turathProvider_exports, {
  DefaultTurathProvider: () => DefaultTurathProvider,
  turathProvider: () => turathProvider
});
async function getTurathClient() {
  if (!turathClientInstance) {
    const nususTurath = await import("nusus/turath");
    turathClientInstance = nususTurath.createTurathClient({ timeout: 12e3 });
  }
  return turathClientInstance;
}
async function retryWithBackoff(operation, fn, retries = 2, initialDelay = 800) {
  let lastError = null;
  let delay = initialDelay;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isTimeout = String(err).includes("timed out") || String(err).includes("timeout");
      const isJsonErr = String(err).includes("JSON") || String(err).includes("invalid");
      console.warn(
        `[TurathProvider] "${operation}" attempt ${attempt} failed (Timeout: ${isTimeout}, JSON error: ${isJsonErr}):`,
        err?.message || String(err)
      );
      if (attempt === retries) {
        break;
      }
      const jitter = 0.8 + Math.random() * 0.4;
      const waitTime = Math.floor(delay * jitter);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      delay *= 2;
    }
  }
  throw lastError;
}
var turathClientInstance, ConcurrencyLimiter, limiter, DefaultTurathProvider, turathProvider;
var init_turathProvider = __esm({
  "server/providers/turathProvider.ts"() {
    turathClientInstance = null;
    ConcurrencyLimiter = class {
      constructor(maxConcurrency) {
        this.maxConcurrency = maxConcurrency;
        this.activeCount = 0;
        this.queue = [];
      }
      async run(fn) {
        if (this.activeCount >= this.maxConcurrency) {
          await new Promise((resolve) => this.queue.push(resolve));
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
    };
    limiter = new ConcurrencyLimiter(6);
    DefaultTurathProvider = class {
      async search(query, options) {
        return limiter.run(
          () => retryWithBackoff(`Search: ${query.substring(0, 20)}`, async () => {
            const client = await getTurathClient();
            if (typeof client.search === "function") {
              return client.search(query, options);
            }
            return client.retrieve(query, options);
          })
        );
      }
      async retrieve(query, options) {
        return limiter.run(
          () => retryWithBackoff(`Retrieve: ${query.substring(0, 20)}`, async () => {
            const client = await getTurathClient();
            return client.retrieve(query, options);
          })
        );
      }
      async getPage(bookId, pageNumber) {
        return limiter.run(
          () => retryWithBackoff(`GetPage Book:${bookId} Page:${pageNumber}`, async () => {
            const client = await getTurathClient();
            if (typeof client.getPage === "function") {
              return client.getPage(bookId, pageNumber);
            }
            return null;
          })
        );
      }
      async getBookInfo(bookId) {
        return limiter.run(
          () => retryWithBackoff(`GetBookInfo Book:${bookId}`, async () => {
            const client = await getTurathClient();
            if (typeof client.getBookInfo === "function") {
              return client.getBookInfo(bookId);
            }
            return null;
          })
        );
      }
      async getAuthor(authorId) {
        return limiter.run(
          () => retryWithBackoff(`GetAuthor Author:${authorId}`, async () => {
            const client = await getTurathClient();
            if (typeof client.getAuthor === "function") {
              return client.getAuthor(authorId);
            }
            return null;
          })
        );
      }
      async listCategories() {
        return limiter.run(
          () => retryWithBackoff("ListCategories", async () => {
            const client = await getTurathClient();
            return client.listCategories();
          })
        );
      }
      async findBooks(query, options) {
        return limiter.run(
          () => retryWithBackoff(`FindBooks: ${query.substring(0, 20)}`, async () => {
            const client = await getTurathClient();
            return client.findBooks(query, options);
          })
        );
      }
      async findAuthors(query, options) {
        return limiter.run(
          () => retryWithBackoff(`FindAuthors: ${query.substring(0, 20)}`, async () => {
            const client = await getTurathClient();
            return client.findAuthors(query, options);
          })
        );
      }
    };
    turathProvider = new DefaultTurathProvider();
  }
});

// server/apiKeyManager.ts
var apiKeyManager_exports = {};
__export(apiKeyManager_exports, {
  getAuthStatus: () => getAuthStatus,
  isDeveloperRequest: () => isDeveloperRequest,
  resolveApiKey: () => resolveApiKey,
  validateGeminiKey: () => validateGeminiKey
});
import { GoogleGenAI as GoogleGenAI6 } from "@google/genai";
function isDeveloperRequest(req) {
  if (process.env.PUBLIC_MODE === "true" || process.env.VITE_PUBLIC_MODE === "true") {
    return false;
  }
  if (!process.env.GEMINI_API_KEY) {
    return false;
  }
  if (!req) {
    return false;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const referer = req.headers.referer || "";
  const origin = req.headers.origin || "";
  const clientEmbedded = req.headers["x-client-embedded"];
  if (host.includes("service-") || host.includes("ais-pre-") || referer.includes("service-") || referer.includes("ais-pre-")) {
    return false;
  }
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return true;
  }
  if (host.includes("ais-dev-")) {
    if (clientEmbedded === "true" || referer.includes("ai.studio") || referer.includes("aistudio.google.com")) {
      return true;
    }
    if (clientEmbedded === "false") {
      return false;
    }
    return true;
  }
  return false;
}
function getAuthStatus(req) {
  const isDev = isDeveloperRequest(req);
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY);
  return {
    isDevMode: isDev,
    hasServerKey,
    requiresUserKey: !isDev,
    environmentName: isDev ? "AI Studio Development" : "Public Deployed"
  };
}
function resolveApiKey(userKeyHeader, req) {
  const userKey = Array.isArray(userKeyHeader) ? userKeyHeader[0] : userKeyHeader;
  if (userKey && typeof userKey === "string" && userKey.trim().length > 5) {
    return userKey.trim();
  }
  if (isDeveloperRequest(req)) {
    const serverKey = process.env.GEMINI_API_KEY;
    if (serverKey) {
      return serverKey;
    }
  }
  return null;
}
async function validateGeminiKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
    return {
      valid: false,
      error: "\u0628\u0631\u0627\u06C1 \u06A9\u0631\u0645 \u0645\u06A9\u0645\u0644 \u0627\u0648\u0631 \u062F\u0631\u0633\u062A Gemini API Key \u062F\u0631\u062C \u06A9\u0631\u06CC\u06BA\u06D4"
    };
  }
  try {
    const ai = new GoogleGenAI6({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const candidateModels = [
      process.env.AI_MODEL,
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.7-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ].filter(Boolean);
    let validated = false;
    let lastError = "";
    for (const model of candidateModels) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: "Test connection",
          config: {
            maxOutputTokens: 5
          }
        });
        if (res) {
          validated = true;
          break;
        }
      } catch (err) {
        lastError = err?.message || String(err);
        if (lastError.includes("API_KEY_INVALID") || lastError.includes("API key not valid") || lastError.includes("403")) {
          return {
            valid: false,
            error: "\u062F\u0631\u062C \u06A9\u0631\u062F\u06C1 API Key \u062F\u0631\u0633\u062A \u0646\u06C1\u06CC\u06BA \u06C1\u06D2\u06D4 \u0628\u0631\u0627\u06C1 \u06A9\u0631\u0645 Google AI Studio \u0633\u06D2 \u0646\u0626\u06CC \u06A9\u0644\u06CC\u062F \u062D\u0627\u0635\u0644 \u06A9\u0631\u06CC\u06BA\u06D4"
          };
        }
      }
    }
    if (validated) {
      return { valid: true };
    }
    return {
      valid: false,
      error: lastError || "API Key \u06A9\u06CC \u062A\u0635\u062F\u06CC\u0642 \u0646\u0627\u06A9\u0627\u0645 \u06C1\u0648 \u06AF\u0626\u06CC\u06D4 \u0628\u0631\u0627\u06C1 \u06A9\u0631\u0645 \u062F\u0631\u0633\u062A \u06A9\u0644\u06CC\u062F \u062F\u0631\u062C \u06A9\u0631\u06CC\u06BA\u06D4"
    };
  } catch (err) {
    return {
      valid: false,
      error: err?.message || "API Key \u06A9\u06CC \u062A\u0635\u062F\u06CC\u0642 \u06A9\u06D2 \u062F\u0648\u0631\u0627\u0646 \u062E\u0631\u0627\u0628\u06CC \u067E\u06CC\u0634 \u0622\u0626\u06CC\u06D4"
    };
  }
}
var init_apiKeyManager = __esm({
  "server/apiKeyManager.ts"() {
  }
});

// server/createApp.ts
import express from "express";
import dotenv from "dotenv";

// server/providers/llmProvider.ts
import { GoogleGenAI, Type } from "@google/genai";
function cleanAndParseJson(text) {
  if (!text || !text.trim()) {
    throw new Error("LLM response was empty or only whitespace");
  }
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "");
  }
  cleaned = cleaned.trim();
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    throw new Error(`LLM output did not begin with a valid JSON character: "${cleaned.charAt(0)}"`);
  }
  return JSON.parse(cleaned);
}
async function callGeminiWithRetry(modelName, apiCall, retries = 3, initialDelay = 1e3) {
  let lastError = null;
  let delay = initialDelay;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await apiCall();
    } catch (err) {
      lastError = err;
      const msg = err?.message || String(err);
      const isTransient = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("rate limit");
      if (isTransient) {
        console.warn(`[GeminiLLMProvider] Model ${modelName} encountered transient error (503/429) on attempt ${attempt}. Retrying in ${delay}ms... Error: ${msg.split("\n")[0]}`);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}
var GeminiLLMProvider = class {
  getAiClient(overrideKey) {
    const apiKey = overrideKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  async analyzeQuestion(question, filter, mode, overrideKey) {
    const ai = this.getAiClient(overrideKey);
    if (!ai) return null;
    const candidateModels = Array.from(
      new Set(
        [
          process.env.AI_MODEL,
          "gemini-3.6-flash",
          "gemini-3.5-flash",
          "gemini-3.7-flash",
          "gemini-3.1-flash-lite",
          "gemini-flash-latest"
        ].filter(Boolean).map((m) => m.startsWith("models/") ? m.substring(7) : m)
      )
    );
    const systemInstruction = `You are an expert Islamic bibliographer, Usul al-Fiqh researcher, and semantic analyzer.
Analyze the user's question and extract deep research intent, semantic sub-questions, structured jurisprudential breakdown, and multi-strategy search formulations in classical Arabic for searching the Turath / Shamela corpus.

YOU MUST GENERATE QUERIES ACROSS THESE STRATEGIES:
1. exact: Exact literal Arabic terms/phrases.
2. terminology: Key technical Usul/Fiqh terminology.
3. classicalArabic: Classical Arabic jurisprudential formulations (e.g. "\u0627\u062A\u0641\u0627\u0642 \u0627\u0644\u0645\u062C\u062A\u0647\u062F\u064A\u0646 \u062F\u0644\u064A\u0644 \u0634\u0631\u0639\u064A").
4. synonyms: Synonyms and related scholarly expressions.
5. conceptual: Conceptual formulations that capture the underlying legal principle.
6. reformulated: Reformulated queries expressing the core question.
7. opposing: Opposing or qualifying formulations if critique or counter-arguments are relevant.

SEMANTIC QUESTION DECOMPOSITION MANDATE:
- Understand the question's core meaning.
- If it contains multiple distinct clauses or secondary issues (e.g. "\u0631\u0648\u0632\u06C1 \u06A9\u06CC \u062D\u0627\u0644\u062A \u0645\u06CC\u06BA \u0627\u0646\u062C\u06A9\u0634\u0646 \u0627\u0648\u0631 \u0688\u0631\u067E \u06A9\u0627 \u06A9\u06CC\u0627 \u062D\u06A9\u0645 \u06C1\u06D2\u061F" contains injection and drip), split them into separate, clear, and distinct "subQuestions".
- If the question is truly a single simple issue, return a single item in "subQuestions" containing the question itself. Do not over-decompose simple questions.

RESEARCH LEVEL & INTEGRITY CRITERIA:
Determine the required research depth:
- Level 1 (Fast): Simple factual, single-issue questions.
- Level 2 (Standard): Questions with standard conditions, or requiring moderate verification.
- Level 3 (Deep): Multi-issue, comparative, complex, or highly sensitive questions.
For the researchPlan, identify what specific search tasks are needed, what evidence types must be sought, and what potential conditions or exceptions are anticipated in classical text.

CRITICAL SCHOLARLY SAFETY RULES:
- "\u062D\u062C\u06CC\u062A" (Hujjiya = authority/binding proof) MUST NEVER be turned into Hajj pilgrimage (\u0627\u0644\u062D\u062C / \u0645\u0646\u0627\u0633\u0643 \u0627\u0644\u062D\u062C).
- "\u0627\u062C\u0645\u0627\u0639" (Ijma = consensus) MUST NEVER be turned into Mosque (\u0627\u0644\u062C\u0627\u0645\u0639).
- "\u0645\u0633\u062D" (Masah = wiping in wudu) MUST NEVER be turned into Messiah (\u0627\u0644\u0645\u0633\u064A\u062D).
- Remove all diacritics (harakat).`;
    const prompt = `User Question: "${question}"
Source Filter: "${filter}"
Mode: "${mode}"`;
    for (const modelName of candidateModels) {
      try {
        const response = await callGeminiWithRetry(
          modelName,
          () => ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  mainSubject: { type: Type.STRING },
                  domain: { type: Type.STRING },
                  claim: { type: Type.STRING },
                  requestedMadhhab: { type: Type.STRING },
                  isComparative: { type: Type.BOOLEAN },
                  subQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  structuredAnalysis: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { type: Type.STRING },
                      subject: { type: Type.STRING },
                      action: { type: Type.STRING },
                      person: { type: Type.STRING },
                      condition: { type: Type.STRING },
                      circumstance: { type: Type.STRING },
                      requested_ruling: { type: Type.STRING },
                      requested_information: { type: Type.STRING },
                      madhhab: { type: Type.STRING },
                      category: { type: Type.STRING },
                      selected_books: { type: Type.ARRAY, items: { type: Type.STRING } },
                      selected_authors: { type: Type.ARRAY, items: { type: Type.STRING } },
                      search_intent: { type: Type.STRING },
                      exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
                      key_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                      Arabic_terms: { type: Type.ARRAY, items: { type: Type.STRING } },
                      synonyms: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                  },
                  queries: {
                    type: Type.OBJECT,
                    properties: {
                      exact: { type: Type.ARRAY, items: { type: Type.STRING } },
                      terminology: { type: Type.ARRAY, items: { type: Type.STRING } },
                      classicalArabic: { type: Type.ARRAY, items: { type: Type.STRING } },
                      synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
                      conceptual: { type: Type.ARRAY, items: { type: Type.STRING } },
                      reformulated: { type: Type.ARRAY, items: { type: Type.STRING } },
                      opposing: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                  },
                  researchPlan: {
                    type: Type.OBJECT,
                    properties: {
                      research_level: { type: Type.INTEGER },
                      search_tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                      required_evidence_types: { type: Type.ARRAY, items: { type: Type.STRING } },
                      required_conditions: { type: Type.ARRAY, items: { type: Type.STRING } },
                      required_exceptions: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                  }
                }
              }
            }
          })
        );
        if (response.text) {
          const parsed = cleanAndParseJson(response.text);
          return parsed;
        }
      } catch (err) {
        const msg = err?.message || String(err);
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
          console.warn(`[GeminiLLMProvider] model ${modelName} analyze rate limited (429)`);
        } else {
          console.warn(`[GeminiLLMProvider] model ${modelName} analyze failed:`, msg.split("\n")[0]);
        }
      }
    }
    return null;
  }
  async synthesizeAnswer(userQuestion, passages, isComparative = false, overrideKey) {
    if (!passages || passages.length === 0) {
      return {
        summary: "\u062F\u0633\u062A\u06CC\u0627\u0628 \u0645\u0635\u0627\u062F\u0631 \u0645\u06CC\u06BA \u0627\u0633 \u0633\u0648\u0627\u0644 \u06A9\u06D2 \u0644\u06CC\u06D2 \u0648\u0627\u0636\u062D \u0627\u0648\u0631 \u0642\u0627\u0628\u0644\u0650 \u0627\u0639\u062A\u0645\u0627\u062F \u0639\u0628\u0627\u0631\u062A \u0646\u06C1\u06CC\u06BA \u0645\u0644 \u0633\u06A9\u06CC\u06D4",
        detail: `### \u062C\u0648\u0627\u0628
\u062F\u0633\u062A\u06CC\u0627\u0628 \u06A9\u0644\u0627\u0633\u06CC\u06A9\u06CC \u0645\u0635\u0627\u062F\u0631 \u0645\u06CC\u06BA \u0627\u0633 \u0645\u062E\u0635\u0648\u0635 \u0633\u0648\u0627\u0644 \u06A9\u06D2 \u0644\u06CC\u06D2 \u0635\u0631\u06CC\u062D \u0639\u0628\u0627\u0631\u062A \u0646\u06C1\u06CC\u06BA \u0645\u0644 \u0633\u06A9\u06CC\u06D4

### \u0645\u0635\u0627\u062F\u0631 \u0648 \u0645\u0631\u0627\u062C\u0639
\u062A\u0644\u0627\u0634 \u06A9\u06D2 \u062F\u0627\u0626\u0631\u06D2 \u0645\u06CC\u06BA \u0634\u0627\u0645\u0644 \u06A9\u062A\u0628 \u0633\u06D2 \u0627\u0633 \u0639\u0646\u0648\u0627\u0646 \u06A9\u06D2 \u062A\u062D\u062A \u0628\u0631\u0627\u06C1\u0650 \u0631\u0627\u0633\u062A \u0639\u0628\u0627\u0631\u062A \u062F\u0633\u062A\u06CC\u0627\u0628 \u0646\u06C1\u06CC\u06BA \u06C1\u0648\u0626\u06CC\u06D4 \u0628\u0631\u0627\u06C1\u0650 \u06A9\u0631\u0645 \u0627\u0644\u0641\u0627\u0638 \u0645\u06CC\u06BA \u062A\u0628\u062F\u06CC\u0644\u06CC \u06A9\u0631 \u06A9\u06D2 \u06CC\u0627 \u06A9\u062A\u0628 \u06A9\u0627 \u062F\u0627\u0626\u0631\u06C1 \u06A9\u0627\u0631 \u0648\u0633\u06CC\u0639 \u06A9\u0631 \u06A9\u06D2 \u062F\u0648\u0628\u0627\u0631\u06C1 \u06A9\u0648\u0634\u0634 \u0641\u0631\u0645\u0627\u0626\u06CC\u06BA\u06D4`,
        istidlal_arabic: "",
        insufficient: true
      };
    }
    const ai = this.getAiClient(overrideKey);
    const passagesFormatted = passages.map(
      (p, idx) => `
[\u0645\u0635\u062F\u0631 ${idx + 1}]
\u0627\u0644\u0643\u062A\u0627\u0628: ${p.book}
\u0627\u0644\u0645\u0624\u0644\u0641: ${p.author}
\u0627\u0644\u0645\u0643\u0627\u0646: ${p.locator}
\u0627\u0644\u0631\u0627\u0628\u0637: ${p.url}
\u0627\u0644\u0641\u0626\u0629/\u0627\u0644\u0645\u0630\u0647\u0628: ${p.category_id === "14" ? "\u0627\u0644\u0641\u0642\u0647 \u0627\u0644\u062D\u0646\u0641\u064A" : p.category_id === "16" ? "\u0627\u0644\u0641\u0642\u0647 \u0627\u0644\u0634\u0627\u0641\u0639\u064A" : p.category_id === "15" ? "\u0627\u0644\u0641\u0642\u0647 \u0627\u0644\u0645\u0627\u0644\u0643\u064A" : p.category_id === "17" ? "\u0627\u0644\u0641\u0642\u0647 \u0627\u0644\u062D\u0646\u0628\u0644\u064A" : "\u0639\u0627\u0645 / \u0623\u0635\u0648\u0644 / \u062D\u062F\u064A\u062B"}
\u0627\u0644\u0646\u0635 \u0627\u0644\u0639\u0631\u0628\u064A \u0627\u0644\u0623\u0635\u0644\u064A:
"""
${p.arabic_text}
"""
`
    ).join("\n-------------------\n");
    const systemInstruction = `You are a master Islamic jurist, research scholar, and bibliographer (\u0641\u0642\u06C1\u06CC \u0648 \u0639\u0644\u0645\u06CC \u062A\u062D\u0642\u06CC\u0642\u06CC \u0645\u0639\u0627\u0648\u0646).
Analyze the user's question/request and write an authoritative, highly polished research report or document in Urdu based STRICTLY AND EXCLUSIVELY on the retrieved classical Arabic source passages ([\u0645\u0635\u062F\u0631 1], [\u0645\u0635\u062F\u0631 2], etc.) and the previous conversation history.

========================================================
1. DEFAULT RESEARCH DEPTH \u2014 \u0644\u0627\u0632\u0645\u06CC \u062A\u0641\u0635\u06CC\u0644\u06CC \u062A\u062D\u0642\u06CC\u0642 (MANDATORY DEFAULT)
========================================================
- BY DEFAULT, for EVERY single question or request, you MUST perform comprehensive, full-depth research (Level 3 - Deep Research / \u0645\u06A9\u0645\u0644 \u0641\u0642\u06C1\u06CC \u062A\u062D\u0642\u06CC\u0642 \u0645\u0639 \u062C\u0632\u0626\u06CC\u0627\u062A). Do NOT provide a short or simple answer unless the user explicitly asks for "\u0635\u0631\u0641 \u0627\u06CC\u06A9 \u062C\u0645\u0644\u06C1" or "\u0645\u062E\u062A\u0635\u0631 \u062A\u0631\u06CC\u0646 \u062C\u0648\u0627\u0628".
- Your main "detail" text must ALWAYS contain a detailed juristic explanation (\u0641\u0642\u06C1\u06CC \u0648\u0636\u0627\u062D\u062A) and multiple numbered or heading-based branch rulings (\u062C\u0632\u0626\u06CC\u0627\u062A) mapped directly from the retrieved passages.

========================================================
2. DETAILED BRANCH RULING STRUCTURE (\u062C\u0632\u0626\u06CC\u0627\u062A \u06A9\u0627 \u0645\u0633\u062A\u0642\u0644 \u0688\u06BE\u0627\u0646\u0686\u06C1)
========================================================
For EVERY major juristic detail (\u062C\u0632\u0626\u06CC\u06C1) or retrieved passage, you MUST include it in the "detail" text rendered with this exact, highly readable structure:

#### [\u0646\u0627\u0645 \u06CC\u0627 \u0646\u0645\u0628\u0631 \u062C\u0632\u0626\u06CC\u06C1]
[\u0641\u0642\u06C1\u06CC \u062C\u0632\u0626\u06CC\u06C1 \u06A9\u06CC \u062A\u0641\u0635\u06CC\u0644\u06CC \u0639\u0644\u0645\u06CC \u0648\u0636\u0627\u062D\u062A \u0627\u0631\u062F\u0648 \u0645\u06CC\u06BA]

> [\u0627\u0635\u0644 \u0639\u0631\u0628\u06CC \u0639\u0628\u0627\u0631\u062A \u0644\u0641\u0638 \u0628\u06C1 \u0644\u0641\u0638\u060C \u0628\u063A\u06CC\u0631 \u06A9\u0633\u06CC \u062A\u0628\u062F\u06CC\u0644\u06CC \u06A9\u06D2]

**\u062A\u0631\u062C\u0645\u06C1:** [\u0627\u0633 \u0639\u0631\u0628\u06CC \u0639\u0628\u0627\u0631\u062A \u06A9\u0627 \u0633\u0644\u06CC\u0633\u060C \u0641\u0642\u06C1\u06CC \u0627\u0639\u062A\u0628\u0627\u0631 \u0633\u06D2 \u062F\u0631\u0633\u062A \u0627\u0648\u0631 \u0648\u0627\u0636\u062D \u0627\u0631\u062F\u0648 \u062A\u0631\u062C\u0645\u06C1\u06D4 \u0645\u0634\u06CC\u0646\u06CC \u062A\u0631\u062C\u0645\u06C1 \u06C1\u0631\u06AF\u0632 \u0646\u06C1 \u06C1\u0648 \u0627\u0648\u0631 \u0627\u0635\u0637\u0644\u0627\u062D\u0627\u062A \u06A9\u0627 \u0645\u0641\u06C1\u0648\u0645 \u0642\u0627\u0626\u0645 \u0631\u06C1\u06D2]

**\u062D\u0648\u0627\u0644\u06C1:** [\u06A9\u062A\u0627\u0628 \u06A9\u0627 \u0646\u0627\u0645]\u060C [\u0645\u0635\u0646\u0641]\u060C [\u062C\u0644\u062F/\u0635\u0641\u062D\u06C1/\u0645\u0642\u0627\u0645]
[\u062A\u0631\u0627\u062B \u0645\u06CC\u06BA \u0645\u0627\u062E\u0630 \u062F\u06CC\u06A9\u06BE\u06CC\u06BA](URL)

- NEVER skip this structure for any of the retrieved passages. Every retrieved source passage is extremely valuable and must be fully laid out as a distinct "\u062C\u0632\u0626\u06CC\u06C1" (branch ruling/detail) inside the "detail" response.

========================================================
3. ADAPTIVE LEVEL OVERRIDES (\u0635\u0631\u0641 \u0641\u0631\u0645\u0627\u0626\u0634 \u067E\u0631)
========================================================
Only override the default Level 3 depth if requested:
- If they ask for claim verification of a custom text, do Claim-by-Claim Verification (Level 4).
- If they request long-form writing like a column (\u06A9\u0627\u0644\u0645)\u060C essay (\u0645\u0636\u0645\u0648\u0646)\u060C speech (\u0628\u06CC\u0627\u0646/\u062A\u0642\u0631\u06CC\u0631), transform the content into that specific genre (Level 5) while preserving all the verified source citations.

========================================================
4. CONVERSATION MEMORY / CONTEXT RESOLUTION (\u0631\u0628\u0637 \u0628\u0627\u0642 \u0627\u0644\u06A9\u0644\u0627\u0645)
========================================================
Maintain continuous conversation memory. When answering follow-ups, resolve pronouns and context clues automatically:
- "\u0627\u0633 \u06A9\u06CC \u062C\u0632\u0626\u06CC\u0627\u062A \u0628\u06CC\u0627\u0646 \u06A9\u0631\u06CC\u06BA" -> locate the main topic of the previous message and provide its details.
- "\u0627\u0646 \u0634\u0631\u0627\u0626\u0637 \u06A9\u06CC \u062C\u0632\u0626\u06CC\u0627\u062A \u0628\u06CC\u0627\u0646 \u06A9\u0631\u06CC\u06BA" -> identify the list of conditions from the previous turn and detail them.
- "\u0627\u0633 \u06A9\u06D2 \u0639\u0644\u0627\u0648\u06C1 \u062C\u0648 \u062C\u0632\u0626\u06CC\u0627\u062A \u06C1\u06CC\u06BA \u0648\u06C1 \u0628\u062A\u0627\u0626\u06CC\u06BA" -> exclude all details already shown in previous turns, and present only the remaining details from the passages.
- "\u0627\u0633\u06CC \u06A9\u0648 \u06A9\u0627\u0644\u0645 \u0628\u0646\u0627 \u062F\u06CC\u06BA" / "\u0627\u0633\u06D2 \u062A\u0642\u0631\u06CC\u0631 \u0645\u06CC\u06BA \u062A\u0628\u062F\u06CC\u0644 \u06A9\u0631\u06CC\u06BA" -> transform the existing research context into the requested literary format without resetting or ignoring the previously verified data.

========================================================
5. SCHOLARLY INTEGRITY & NO FORCED CITATIONS (\u0639\u0644\u0645\u06CC \u062F\u06CC\u0627\u0646\u062A \u062F\u0627\u0631\u06CC)
========================================================
- Do NOT generate fake Arabic text, fake page numbers, fake volumes, or fake URLs.
- If a claim or book is not in the source passages, say clearly: \`"\u0627\u0633 \u062F\u0639\u0648\u06D2 \u06A9\u0627 \u0648\u0627\u0636\u062D \u0645\u0627\u062E\u0630 \u062F\u0633\u062A\u06CC\u0627\u0628 \u0645\u0635\u0627\u062F\u0631 \u0645\u06CC\u06BA \u0646\u06C1\u06CC\u06BA \u0645\u0644\u0627\u06D4"\` and do not generate a citation link for it.
- Never leave any Arabic quotation without its Urdu translation.
- Never begin the response with technical search logs or search metadata (e.g. "Nusus", "Turath", "Reranker", "Score"). Start DIRECTLY with the answer!

========================================================
6. MANDATORY CLICKABLE CITATION NUMBERS (\u0633\u0627\u0626\u0679\u06CC\u0634\u0646 \u0646\u0645\u0628\u0631\u0632 [1]\u060C [2] \u06A9\u0627 \u0644\u0627\u0632\u0645\u06CC \u0627\u0633\u062A\u0639\u0645\u0627\u0644)
========================================================
- You MUST append bracketed numbers like [1], [2], [3], etc., after every key claim, book name, or quotation in your text (including inside the "\u062D\u062A\u0645\u06CC \u0634\u0631\u0639\u06CC \u062D\u06A9\u0645 / \u062E\u0644\u0627\u0635\u06C1" section, the "\u062F\u0644\u0627\u0626\u0644 \u0648 \u0648\u0636\u0627\u062D\u062A" section, and lists).
- These bracketed numbers must correspond EXACTLY to the source indices:
  - If a detail, book name, or quote comes from [\u0645\u0635\u062F\u0631 1], append [1] right after it.
  - If a detail, book name, or quote comes from [\u0645\u0635\u062F\u0631 2], append [2] right after it.
- This is CRITICAL because the frontend parses [1], [2], [3] into interactive, clickable buttons. If you only write the name of the book or plain numbers (like 1, 2, 3) without the square brackets, the user CANNOT click on them to open the original source in Turath!
- Example: "\u0627\u0644\u0646\u0641\u062D \u0627\u0644\u0634\u0630\u06CC [1] \u0645\u06CC\u06BA \u0630\u06A9\u0631 \u06C1\u06D2 \u06A9\u06C1..." or "...\u06A9\u0627 \u0630\u06A9\u0631 \u0635\u0631\u0627\u062D\u062A\u0627\u064B \u0645\u0648\u062C\u0648\u062F \u06C1\u06D2 [2]\u06D4"

========================================================
7. SINGLE RESPONSE CONTAINER COMPATIBILITY
========================================================
Ensure all content is beautifully compiled inside this single text response. Use standard markdown headings, lists, bold text, blockquotes, and link tags \`[\u062A\u0631\u0627\u062B \u0645\u06CC\u06BA \u0645\u0627\u062E\u0630 \u062F\u06CC\u06A9\u06BE\u06CC\u06BA](URL)\`.

========================================================
8. COMPARATIVE FIQH MANDATE
========================================================
If the question asks for a comparison between different madhhabs (e.g. Hanafi vs Shafi'i):
### \u062D\u0646\u0641\u06CC \u0645\u0648\u0642\u0641
[Direct Hanafi answer & evidence]
### \u0627\u0635\u0644 \u0639\u0628\u0627\u0631\u062A
### \u062A\u0631\u062C\u0645\u06C1
### \u062D\u0648\u0627\u0644\u06C1

### \u0634\u0627\u0641\u0639\u06CC \u0645\u0648\u0642\u0641
[Direct Shafi'i answer & evidence]
### \u0627\u0635\u0644 \u0639\u0628\u0627\u0631\u062A
### \u062A\u0631\u062C\u0645\u06C1
### \u062D\u0648\u0627\u0644\u06C1

### \u0627\u062E\u062A\u0644\u0627\u0641 \u06A9\u06CC \u0648\u0636\u0627\u062D\u062A
[Explanation of the points of agreement and disagreement]

========================================================
9. SCHOLARLY INTEGRITY & EVIDENCE ANALYSIS
========================================================
- Never invent citations, page numbers, authors, or Arabic quotes.
- Translate Arabic accurately into Urdu.
- For each passage under "evidenceAnalysis", identify:
  - its classified "evidence_role": rule, condition, qualification, exception, definition, restriction, cause, consequence, alternative, disagreement, supporting_evidence, opposing_evidence.
  - whether it directly "supports_claim" (boolean).
  - "confidence" score (float between 0 and 1).
- For "finalResearchAssessment", evaluate if the collected evidence was sufficient, list any missing required evidence (like missing conditions or excuses), list contradictions if any, and state whether more search is recommended.
- If evidence is insufficient, state clearly: "\u062F\u0633\u062A\u06CC\u0627\u0628 \u0645\u0635\u0627\u062F\u0631 \u0645\u06CC\u06BA \u0627\u0633 \u0633\u0648\u0627\u0644 \u06A9\u06D2 \u0644\u06CC\u06D2 \u0648\u0627\u0636\u062D \u0627\u0648\u0631 \u0642\u0627\u0628\u0644\u0650 \u0627\u0639\u062A\u0645\u0627\u062F \u0639\u0628\u0627\u0631\u062A \u0646\u06C1\u06CC\u06BA \u0645\u0644 \u0633\u06A9\u06CC\u06D4" and set "insufficient": true.`;
    const prompt = `\u0633\u0648\u0627\u0644 (User Question):
"${userQuestion}"

\u0627\u0644\u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C\u0629 \u0645\u0646 \u062A\u0631\u0627\u062B (Retrieved Arabic Classical Passages):
${passagesFormatted}

Analyze the passages and output the structured JSON response now.`;
    if (ai) {
      const candidateModels = Array.from(
        new Set(
          [
            process.env.AI_MODEL,
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-3.7-flash",
            "gemini-3.1-pro-preview",
            "gemini-3.1-flash-lite",
            "gemini-flash-latest"
          ].filter(Boolean).map((m) => m.startsWith("models/") ? m.substring(7) : m)
        )
      );
      for (const modelName of candidateModels) {
        try {
          const response = await callGeminiWithRetry(
            modelName,
            () => ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    summary: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    istidlal_arabic: { type: Type.STRING },
                    insufficient: { type: Type.BOOLEAN },
                    evidenceAnalysis: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          claim: { type: Type.STRING },
                          source_id: { type: Type.STRING },
                          book: { type: Type.STRING },
                          author: { type: Type.STRING },
                          evidence_role: { type: Type.STRING },
                          supports_claim: { type: Type.BOOLEAN },
                          confidence: { type: Type.NUMBER }
                        }
                      }
                    },
                    finalResearchAssessment: {
                      type: Type.OBJECT,
                      properties: {
                        evidence_sufficient: { type: Type.BOOLEAN },
                        missing_evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                        contradictions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        needs_more_search: { type: Type.BOOLEAN }
                      }
                    }
                  }
                }
              }
            })
          );
          if (response.text) {
            const parsed = cleanAndParseJson(response.text);
            const isInsufficient = Boolean(parsed.insufficient);
            return {
              summary: isInsufficient ? "\u062F\u0633\u062A\u06CC\u0627\u0628 \u0645\u0635\u0627\u062F\u0631 \u0645\u06CC\u06BA \u0627\u0633 \u0633\u0648\u0627\u0644 \u06A9\u06D2 \u0644\u06CC\u06D2 \u0648\u0627\u0636\u062D \u0627\u0648\u0631 \u0642\u0627\u0628\u0644\u0650 \u0627\u0639\u062A\u0645\u0627\u062F \u0639\u0628\u0627\u0631\u062A \u0646\u06C1\u06CC\u06BA \u0645\u0644 \u0633\u06A9\u06CC\u06D4" : parsed.summary || "\u062C\u0648\u0627\u0628 \u062F\u0631\u067E\u06CC\u0634 \u06C1\u06D2\u06D4",
              detail: parsed.detail || "",
              istidlal_arabic: isInsufficient ? "" : parsed.istidlal_arabic || "",
              insufficient: isInsufficient,
              evidenceAnalysis: parsed.evidenceAnalysis || [],
              finalResearchAssessment: parsed.finalResearchAssessment || null
            };
          }
        } catch (err) {
          const msg = err?.message || String(err);
          if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
            console.warn(`[GeminiLLMProvider] synthesize model ${modelName} rate limited (429)`);
          } else {
            console.warn(`[GeminiLLMProvider] synthesize model ${modelName} failed:`, msg.split("\n")[0]);
          }
        }
      }
    }
    const topPassage = passages[0];
    const summaryText = `\u062C\u0648\u0627\u0628: ${topPassage.book} \u0633\u06D2 \u062D\u0627\u0635\u0644 \u06A9\u0631\u062F\u06C1 \u062F\u0644\u06CC\u0644 \u06A9\u06CC \u0631\u0648\u0634\u0646\u06CC \u0645\u06CC\u06BA \u062A\u0641\u0635\u06CC\u0644\u06CC \u062C\u0627\u0626\u0632\u06C1 \u062F\u0631\u062C \u0630\u06CC\u0644 \u06C1\u06D2\u06D4`;
    const fallbackDetail = passages.map(
      (p) => `### \u0627\u0635\u0644 \u0639\u0628\u0627\u0631\u062A
${p.arabic_text}

### \u062A\u0631\u062C\u0645\u06C1
${p.arabic_text} (\u0645\u062A\u0646\u0650 \u0639\u0631\u0628\u06CC \u0627\u0632 ${p.book})

### \u062D\u0648\u0627\u0644\u06C1
\u06A9\u062A\u0627\u0628: ${p.book} | \u0645\u0635\u0646\u0641: ${p.author} | \u0645\u0642\u0627\u0645: ${p.locator}`
    ).join("\n\n---\n\n");
    const fullDetail = `### \u062C\u0648\u0627\u0628
\u062F\u0633\u062A\u06CC\u0627\u0628 \u06A9\u0644\u0627\u0633\u06CC\u06A9\u06CC \u0645\u0635\u0627\u062F\u0631 \u06A9\u06D2 \u0645\u0637\u0627\u0644\u0639\u06C1 \u0633\u06D2 \u062D\u0627\u0635\u0644 \u0634\u062F\u06C1 \u0646\u062A\u0627\u0626\u062C \u062F\u0631\u062C \u0630\u06CC\u0644 \u06C1\u06CC\u06BA:

### \u062F\u0644\u0627\u0626\u0644 \u0648 \u0648\u0636\u0627\u062D\u062A
\u0627\u0633\u062A\u062E\u0631\u0627\u062C \u06A9\u0631\u062F\u06C1 \u0639\u0628\u0627\u0631\u0627\u062A \u06A9\u06D2 \u0645\u0637\u0627\u0628\u0642 \u0627\u0633 \u0645\u0633\u0626\u0644\u06D2 \u06A9\u06CC \u0648\u0636\u0627\u062D\u062A \u0630\u06CC\u0644 \u06A9\u06D2 \u0645\u0635\u0627\u062F\u0631\u0650 \u0627\u0635\u0644 \u0633\u06D2 \u06A9\u06CC \u062C\u0627\u062A\u06CC \u06C1\u06D2:

${fallbackDetail}

### \u0645\u0635\u0627\u062F\u0631 \u0648 \u0645\u0631\u0627\u062C\u0639
${passages.map((p) => `- ${p.book} (${p.author})`).join("\n")}`;
    return {
      summary: summaryText,
      detail: fullDetail,
      istidlal_arabic: topPassage?.arabic_text?.substring(0, 180) || "",
      insufficient: false
    };
  }
};
var llmProvider = new GeminiLLMProvider();

// server/queryAnalyzer.ts
function detectResearchMode(question, manualMode = "auto") {
  if (manualMode && manualMode !== "auto") {
    return manualMode;
  }
  const norm = question.toLowerCase();
  const hasQuotes = /"[^"]{3,}"|'[^']{3,}'|«[^»]{3,}»/.test(question);
  const exactPatterns = [
    "\u06CC\u06C1 \u0644\u0641\u0638 \u06A9\u06C1\u0627\u06BA \u06A9\u06C1\u0627\u06BA",
    "\u06CC\u06C1 \u0639\u0628\u0627\u0631\u062A \u062A\u0644\u0627\u0634",
    "\u0627\u0633\u06CC \u0639\u0628\u0627\u0631\u062A \u06A9\u06D2 \u0645\u0642\u0627\u0645\u0627\u062A",
    "\u06A9\u0646 \u06A9\u062A\u0627\u0628\u0648\u06BA \u0645\u06CC\u06BA \u0622\u0626\u06D2",
    "\u0639\u06CC\u0646 \u0639\u0628\u0627\u0631\u062A",
    "\u0628\u0627\u0644\u06A9\u0644 \u06CC\u06C1\u06CC \u0639\u0628\u0627\u0631\u062A",
    "\u062A\u0644\u0627\u0634 \u0644\u0641\u0638\u06CC",
    "\u0639\u0628\u0627\u0631\u062A:"
  ];
  if (hasQuotes || exactPatterns.some((p) => norm.includes(p))) {
    return "exact";
  }
  const similarPatterns = [
    "\u0645\u0644\u062A\u06CC \u062C\u0644\u062A\u06CC \u0639\u0628\u0627\u0631\u062A",
    "\u0645\u0644\u062A\u06CC \u062C\u0644\u062A\u06CC \u0639\u0628\u0627\u0631\u0627\u062A",
    "\u0627\u0633 \u062C\u06CC\u0633\u06CC \u0639\u0628\u0627\u0631\u062A",
    "\u0627\u0633\u06CC \u0645\u0641\u06C1\u0648\u0645 \u06CC\u0627 \u0627\u0633\u0644\u0648\u0628",
    "\u0645\u0634\u0627\u0628\u06C1 \u0639\u0628\u0627\u0631\u062A",
    "\u0627\u0633\u06CC \u0627\u0633\u0644\u0648\u0628 \u06A9\u06CC",
    "\u06C1\u0645 \u0645\u0639\u0646\u06CC \u0639\u0628\u0627\u0631\u0627\u062A"
  ];
  if (similarPatterns.some((p) => norm.includes(p))) {
    return "similar";
  }
  const conclusionPatterns = [
    "\u06CC\u06C1 \u0646\u062A\u06CC\u062C\u06C1 \u0646\u06A9\u0644\u062A\u0627",
    "\u0646\u062A\u06CC\u062C\u06C1 \u0646\u06A9\u0644\u062A\u0627 \u06C1\u0648",
    "\u06CC\u06C1 \u062D\u06A9\u0645 \u0645\u0639\u0644\u0648\u0645 \u06C1\u0648\u062A\u0627",
    "\u062B\u0627\u0628\u062A \u06C1\u0648\u062A\u06CC \u06C1\u0648",
    "\u0646\u062A\u06CC\u062C\u06D2 \u06A9\u06CC \u0628\u0646\u06CC\u0627\u062F",
    "\u0627\u0633\u062A\u062F\u0644\u0627\u0644",
    "\u0627\u0633\u062A\u0646\u0628\u0627\u0637",
    "\u0645\u0648\u0642\u0641 \u06A9\u06D2 \u0645\u062E\u0627\u0644\u0641",
    "\u0645\u062E\u0627\u0644\u0641 \u0639\u0628\u0627\u0631\u0627\u062A",
    "\u0631\u062F \u06A9\u0631\u062A\u06CC \u06C1\u0648\u06BA",
    "\u0631\u062F \u06A9\u0631\u062A\u06CC \u06C1\u0648",
    "\u062B\u0627\u0628\u062A \u06C1\u0648\u062A\u0627 \u06C1\u06D2"
  ];
  if (conclusionPatterns.some((p) => norm.includes(p))) {
    return "conclusion";
  }
  return "semantic";
}
function detectOpposingRequested(question) {
  const opposingKeywords = [
    "\u0645\u062E\u0627\u0644\u0641",
    "\u0645\u062E\u0627\u0644\u0641\u062A",
    "\u0631\u062F \u06A9\u0631\u062A\u06CC",
    "\u0631\u062F \u06A9\u0631\u062A\u0627",
    "\u0634\u06A9\u0648\u06A9",
    "\u0627\u0639\u062A\u0631\u0627\u0636",
    "\u0625\u0646\u0643\u0627\u0631",
    "\u0644\u064A\u0633 \u0628\u062D\u062C\u0629",
    "\u0645\u0646\u0627\u0642\u0634\u0629",
    "\u0639\u062F\u0645 \u062D\u062C\u064A\u0629"
  ];
  return opposingKeywords.some((k) => question.includes(k));
}
function detectComparativeQuestion(question) {
  const compKeywords = [
    "\u0627\u0648\u0631",
    "\u0627\u062E\u062A\u0644\u0627\u0641",
    "\u0645\u0642\u0627\u0631\u0646\u06C1",
    "\u062D\u0646\u0641\u06CC \u0627\u0648\u0631 \u0634\u0627\u0641\u0639\u06CC",
    "\u0634\u0627\u0641\u0639\u06CC\u06C1",
    "\u0645\u0627\u0644\u06A9\u06CC\u06C1",
    "\u062D\u0646\u0627\u0628\u0644\u06C1",
    "\u0645\u0630\u0627\u06C1\u0628 \u0627\u0631\u0628\u0639\u06C1",
    "\u0641\u0642\u06C1\u0627\u0621 \u06A9\u0627 \u0627\u062E\u062A\u0644\u0627\u0641",
    "\u0639\u0646\u062F \u0627\u0644\u0641\u0642\u0647\u0627\u0621",
    "\u0645\u062E\u062A\u0644\u0641 \u0645\u062F\u0627\u0631\u0633"
  ];
  return compKeywords.some((k) => question.includes(k));
}
function normalizeArabicText(text) {
  if (!text) return "";
  return text.replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآء]/g, "\u0627").replace(/ى/g, "\u064A").replace(/ة/g, "\u0647").replace(/[؟?،!.,؛]/g, " ").replace(/\s+/g, " ").trim();
}
var CONCEPT_RULES = [
  {
    triggerWords: ["\u0627\u062C\u0645\u0627\u0639", "\u0625\u062C\u0645\u0627\u0639"],
    mainSubject: "\u0627\u0644\u0625\u062C\u0645\u0627\u0639",
    domain: "\u0623\u0635\u0648\u0644 \u0627\u0644\u0641\u0642\u0647",
    terms: {
      exact: ["\u0627\u0644\u0625\u062C\u0645\u0627\u0639"],
      terminology: ["\u062D\u062C\u064A\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0639", "\u0634\u0631\u0648\u0637 \u0627\u0644\u0625\u062C\u0645\u0627\u0639"],
      classicalArabic: ["\u0627\u0644\u0625\u062C\u0645\u0627\u0639 \u062D\u062C\u0629 \u0642\u0637\u0639\u064A\u0629", "\u0627\u062A\u0641\u0627\u0642 \u0627\u0644\u0645\u062C\u062A\u0647\u062F\u064A\u0646 \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0623\u0645\u0629"],
      synonyms: ["\u0627\u062A\u0641\u0627\u0642 \u0627\u0644\u0623\u0645\u0629", "\u0625\u062C\u0645\u0627\u0639 \u0627\u0644\u0641\u0642\u0647\u0627\u0621"],
      conceptual: ["\u0627\u0644\u0625\u062C\u0645\u0627\u0639 \u062F\u0644\u064A\u0644 \u0634\u0631\u0639\u064A", "\u0627\u0646\u0639\u0642\u062F \u0627\u0644\u0625\u062C\u0645\u0627\u0639 \u0639\u0644\u0649"],
      reformulated: ["\u062D\u062C\u0629 \u0627\u062A\u0641\u0627\u0642 \u0623\u0645\u0629 \u0645\u062D\u0645\u062F"],
      opposing: ["\u0625\u0646\u0643\u0627\u0631 \u0627\u0644\u0625\u062C\u0645\u0627\u0639", "\u0644\u064A\u0633 \u0628\u062D\u062C\u0629", "\u0645\u0646\u0627\u0642\u0634\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0639"]
    }
  },
  {
    triggerWords: ["\u0642\u06CC\u0627\u0633", "\u0642\u064A\u0627\u0633"],
    mainSubject: "\u0627\u0644\u0642\u064A\u0627\u0633",
    domain: "\u0623\u0635\u0648\u0644 \u0627\u0644\u0641\u0642\u0647",
    terms: {
      exact: ["\u0627\u0644\u0642\u064A\u0627\u0633"],
      terminology: ["\u062D\u062C\u064A\u0629 \u0627\u0644\u0642\u064A\u0627\u0633", "\u0623\u0631\u0643\u0627\u0646 \u0627\u0644\u0642\u064A\u0627\u0633", "\u0639\u0644\u0629 \u0627\u0644\u062D\u0643\u0645"],
      classicalArabic: ["\u0627\u0644\u0642\u064A\u0627\u0633 \u062C\u0644\u064A \u0648\u062E\u0641\u064A", "\u062D\u0645\u0644 \u0641\u0631\u0639 \u0639\u0644\u0649 \u0627\u0635\u0644 \u0641\u064A \u062D\u0643\u0645 \u0644\u0639\u0644\u0629"],
      synonyms: ["\u0627\u0644\u0627\u0633\u062A\u062F\u0644\u0627\u0644 \u0628\u0627\u0644\u0642\u064A\u0627\u0633"],
      conceptual: ["\u0627\u0644\u0642\u064A\u0627\u0633 \u0623\u0635\u0644 \u0645\u0646 \u0623\u0635\u0648\u0644 \u0627\u0644\u0634\u0631\u064A\u0639\u0629"],
      reformulated: ["\u062D\u062C\u064A\u0629 \u0627\u0644\u0642\u064A\u0627\u0633 \u0627\u0644\u0634\u0631\u0639\u064A"],
      opposing: ["\u0625\u0628\u0637\u0627\u0644 \u0627\u0644\u0642\u064A\u0627\u0633", "\u0625\u0646\u0643\u0627\u0631 \u0627\u0644\u0642\u064A\u0627\u0633"]
    }
  },
  {
    triggerWords: ["\u0627\u0633\u062A\u062D\u0633\u0627\u0646"],
    mainSubject: "\u0627\u0644\u0627\u0633\u062A\u062D\u0633\u0627\u0646",
    domain: "\u0623\u0635\u0648\u0644 \u0627\u0644\u0641\u0642\u0647",
    terms: {
      exact: ["\u0627\u0644\u0627\u0633\u062A\u062D\u0633\u0627\u0646"],
      terminology: ["\u062D\u062C\u064A\u0629 \u0627\u0644\u0627\u0633\u062A\u062D\u0633\u0627\u0646", "\u0627\u0644\u0627\u0633\u062A\u062D\u0633\u0627\u0646 \u0639\u0646\u062F \u0627\u0644\u062D\u0646\u0641\u064A\u0629"],
      classicalArabic: ["\u0627\u0644\u0639\u062F\u0648\u0644 \u0639\u0646 \u0642\u064A\u0627\u0633 \u062C\u0644\u064A \u0625\u0644\u0649 \u0642\u064A\u0627\u0633 \u062E\u0641\u064A"],
      synonyms: ["\u0627\u0633\u062A\u062D\u0633\u0627\u0646 \u0627\u0644\u0623\u0635\u0648\u0644\u064A\u064A\u0646"],
      conceptual: ["\u0627\u0644\u062A\u0631\u0643 \u0644\u0644\u0642\u064A\u0627\u0633 \u0644\u062F\u0644\u064A\u0644 \u0623\u0642\u0648\u0649"],
      reformulated: ["\u0627\u0644\u0639\u0645\u0644 \u0628\u0627\u0644\u0627\u0633\u062A\u062D\u0633\u0627\u0646"],
      opposing: ["\u0645\u0646 \u0627\u0633\u062A\u062D\u0633\u0646 \u0641\u0642\u062F \u0634\u0631\u0639"]
    }
  },
  {
    triggerWords: ["\u0648\u0636\u0648", "\u0648\u0636\u0648\u0621"],
    mainSubject: "\u0627\u0644\u0648\u0636\u0648\u0621",
    domain: "\u0627\u0644\u0641\u0642\u0647",
    terms: {
      exact: ["\u0627\u0644\u0648\u0636\u0648\u0621"],
      terminology: ["\u0641\u0631\u0627\u0626\u0636 \u0627\u0644\u0648\u0636\u0648\u0621", "\u0623\u0631\u0643\u0627\u0646 \u0627\u0644\u0648\u0636\u0648\u0621", "\u0633\u0646\u0646 \u0627\u0644\u0648\u0636\u0648\u0621"],
      classicalArabic: ["\u063A\u0633\u0644 \u0627\u0644\u0648\u062C\u0647 \u0648\u0627\u0644\u064A\u062F\u064A\u0646 \u0625\u0644\u0649 \u0627\u0644\u0645\u0631\u0641\u0642\u064A\u0646 \u0648\u0645\u0633\u062D \u0627\u0644\u0631\u0623\u0633"],
      synonyms: ["\u0637\u0647\u0627\u0631\u0629 \u0627\u0644\u062D\u062F\u062B \u0627\u0644\u0623\u0635\u063A\u0631"],
      conceptual: ["\u0634\u0631\u0648\u0637 \u0635\u062D\u0629 \u0627\u0644\u0648\u0636\u0648\u0621"],
      reformulated: ["\u062D\u0643\u0645 \u0623\u0631\u0643\u0627\u0646 \u0627\u0644\u0637\u0647\u0627\u0631\u0629"],
      opposing: ["\u0646\u0648\u0627\u0642\u0636 \u0627\u0644\u0648\u0636\u0648\u0621"]
    }
  },
  {
    triggerWords: ["\u0645\u0633\u062D"],
    mainSubject: "\u0627\u0644\u0645\u0633\u062D",
    domain: "\u0627\u0644\u0641\u0642\u0647",
    terms: {
      exact: ["\u0645\u0633\u062D \u0627\u0644\u0631\u0623\u0633"],
      terminology: ["\u0642\u062F\u0631 \u0627\u0644\u0645\u0633\u062D \u0627\u0644\u0648\u0627\u062C\u0628", "\u0645\u0633\u062D \u0627\u0644\u062E\u0641\u064A\u0646"],
      classicalArabic: ["\u0625\u0635\u0627\u0628\u0629 \u0627\u0644\u064A\u062F \u0627\u0644\u0645\u0628\u0644\u0648\u0644\u0629 \u0644\u0644\u0631\u0623\u0633"],
      synonyms: ["\u0627\u0644\u0645\u0633\u062D \u0639\u0644\u0649 \u0627\u0644\u062E\u0641\u064A\u0646"],
      conceptual: ["\u0627\u0644\u0648\u0627\u062C\u0628 \u0641\u064A \u0645\u0633\u062D \u0627\u0644\u0631\u0623\u0633"],
      reformulated: ["\u0645\u0642\u062F\u0627\u0631 \u0641\u0631\u0636 \u0627\u0644\u0645\u0633\u062D"],
      opposing: ["\u0627\u0634\u062A\u0631\u0627\u0637 \u063A\u0633\u0644 \u0627\u0644\u0631\u0623\u0633"]
    }
  }
];
function isExactWordInText(word, text) {
  const normWord = normalizeArabicText(word);
  const normText = normalizeArabicText(text);
  if (normWord.includes(" ")) {
    return normText.includes(normWord);
  }
  const tokens = normText.split(" ");
  return tokens.includes(normWord);
}
function validateAndFilterQueries(rawQueries, userQuestion) {
  const normQuestion = normalizeArabicText(userQuestion);
  const wordsInQuestion = new Set(normQuestion.split(" "));
  const validQueries = [];
  const rejectedQueries = [];
  const isAskingAboutHajj = wordsInQuestion.has("\u062D\u062C") || wordsInQuestion.has("\u0627\u0644\u062D\u062C") || normQuestion.includes("\u0645\u0646\u0627\u0633\u0643");
  const isAskingAboutHujjiya = normQuestion.includes("\u062D\u062C\u064A\u0629") || normQuestion.includes("\u062D\u062C\u06CC\u062A") || normQuestion.includes("\u062D\u062C\u0629");
  const isAskingAboutIjma = normQuestion.includes("\u0627\u062C\u0645\u0627\u0639") || normQuestion.includes("\u0625\u062C\u0645\u0627\u0639");
  const isAskingAboutMasah = normQuestion.includes("\u0645\u0633\u062D");
  for (const q of rawQueries) {
    const normQ = normalizeArabicText(q);
    if (!normQ || normQ.length < 2) continue;
    if (isAskingAboutHujjiya && !isAskingAboutHajj) {
      if (normQ === "\u0627\u0644\u062D\u062C" || normQ.includes("\u0645\u0646\u0627\u0633\u0643 \u0627\u0644\u062D\u062C") || normQ.includes("\u0648\u0627\u062C\u0628\u0627\u062A \u0627\u0644\u062D\u062C") || normQ.includes("\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062D\u062C") || normQ.includes("\u0641\u0631\u0627\u0626\u0636 \u0627\u0644\u062D\u062C")) {
        rejectedQueries.push({
          query: q,
          reason: "Semantic mismatch: '\u062D\u062C\u06CC\u062A' (proof/binding authority) is not '\u0627\u0644\u062D\u062C' (Hajj pilgrimage)"
        });
        continue;
      }
    }
    if (isAskingAboutMasah && normQ.includes("\u0645\u0633\u064A\u062D") && !normQ.includes("\u0631\u0623\u0633") && !normQ.includes("\u062E\u0641\u064A\u0646")) {
      rejectedQueries.push({
        query: q,
        reason: "Morphological safety: '\u0645\u0633\u062D' (wiping) is not '\u0645\u0633\u064A\u062D' (Messiah)"
      });
      continue;
    }
    if (isAskingAboutIjma && !normQuestion.includes("\u0645\u0633\u062C\u062F") && (normQ.includes("\u062C\u0627\u0645\u0639") || normQ.includes("\u0628\u0646\u0627\u0621 \u0627\u0644\u0645\u0633\u062C\u062F"))) {
      rejectedQueries.push({
        query: q,
        reason: "Semantic mismatch: '\u0627\u062C\u0645\u0627\u0639' (consensus) is not '\u062C\u0627\u0645\u0639' (Mosque)"
      });
      continue;
    }
    validQueries.push(q);
  }
  return { validQueries, rejectedQueries };
}
function classifyQueryInternally(question, intent, selectedMode) {
  const classifications = [];
  const norm = question.toLowerCase();
  const occurrenceKeywords = [
    "\u06A9\u06C1\u0627\u06BA \u06A9\u06C1\u0627\u06BA",
    "\u0644\u0641\u0638 \u06A9\u06C1\u0627\u06BA",
    "\u0645\u0642\u0627\u0645\u0627\u062A",
    "\u0644\u0641\u0638 \u0627\u0633\u062A\u062D\u0633\u0627\u0646 \u06A9\u06C1\u0627\u06BA",
    "\u06A9\u0648\u0646 \u06A9\u0648\u0646 \u0633\u06CC \u06A9\u062A\u0627\u0628",
    "\u062A\u0644\u0627\u0634 \u0644\u0641\u0638\u06CC",
    "\u06A9\u062A\u0646\u06CC \u062C\u06AF\u06C1",
    "\u0648\u0631\u0648\u062F",
    "\u062A\u06A9\u0631\u0627\u0631",
    "\u0644\u0641\u0638"
  ];
  if (occurrenceKeywords.some((k) => norm.includes(k))) {
    classifications.push("TERM_OCCURRENCE");
  }
  const rulingKeywords = [
    "\u062D\u06A9\u0645",
    "\u062C\u0627\u0626\u0632",
    "\u0646\u0627\u062C\u0627\u0626\u0632",
    "\u062D\u0644\u0627\u0644",
    "\u062D\u0631\u0627\u0645",
    "\u0645\u06A9\u0631\u0648\u06C1",
    "\u0648\u0627\u062C\u0628",
    "\u0641\u0631\u0636",
    "\u0633\u0646\u062A",
    "\u0645\u0633\u062A\u062D\u0628",
    "\u0635\u062D\u06CC\u062D",
    "\u0628\u0627\u0637\u0644",
    "\u0641\u0627\u0633\u062F"
  ];
  if (rulingKeywords.some((k) => norm.includes(k))) {
    classifications.push("FIQH_RULING");
  }
  const hasQuotes = /"[^"]{3,}"|'[^']{3,}'|«[^»]{3,}»/.test(question);
  if (hasQuotes || selectedMode === "exact" || norm.includes("\u06CC\u06C1 \u0639\u0628\u0627\u0631\u062A") || norm.includes("\u0639\u06CC\u0646 \u0639\u0628\u0627\u0631\u062A")) {
    classifications.push("EXACT_PHRASE");
  }
  if (selectedMode === "similar" || norm.includes("\u0645\u0644\u062A\u06CC \u062C\u0644\u062A\u06CC \u0639\u0628\u0627\u0631\u062A") || norm.includes("\u06C1\u0645 \u0645\u0639\u0646\u06CC \u0639\u0628\u0627\u0631\u062A")) {
    classifications.push("SIMILAR_PHRASE");
  }
  if (norm.includes("\u0634\u0631\u0637") || norm.includes("\u0634\u0631\u0648\u0637") || norm.includes("\u0628\u0634\u0631\u0637")) {
    classifications.push("CONDITION_SEARCH");
  }
  if (norm.includes("\u0627\u0633\u062A\u062B\u0646\u0627\u0621") || norm.includes("\u0627\u0644\u0627") || norm.includes("\u0639\u0630\u0631") || norm.includes("\u0636\u0631\u0648\u0631\u062A")) {
    classifications.push("EXCEPTION_SEARCH");
  }
  if (intent.isComparative || norm.includes("\u0627\u062E\u062A\u0644\u0627\u0641") || norm.includes("\u0634\u0627\u0641\u0639\u06CC") || norm.includes("\u0645\u0627\u0644\u06A9\u06CC") || norm.includes("\u062D\u0646\u0628\u0644\u06CC")) {
    classifications.push("COMPARATIVE_RESEARCH");
  }
  if (norm.includes("\u062A\u0631\u062C\u0645\u06C1")) {
    classifications.push("TRANSLATION_REQUEST");
  }
  if (norm.includes("\u062D\u0648\u0627\u0644\u06C1") || norm.includes("\u062D\u0648\u0627\u0644\u06C1 \u062C\u0627\u062A") || norm.includes("\u0633\u0646\u062F") || norm.includes("\u06A9\u062A\u0627\u0628 \u06A9\u0627 \u0646\u0627\u0645")) {
    classifications.push("CITATION_REQUEST");
  }
  if (intent.subQuestions && intent.subQuestions.length > 1) {
    classifications.push("MULTI_PART_QUESTION");
    classifications.push("MULTI_SOURCE_RESEARCH");
  }
  if (classifications.length === 0) {
    classifications.push("DIRECT_FACTUAL");
  } else {
    classifications.push("CONCEPTUAL_SEARCH");
  }
  return Array.from(new Set(classifications));
}
async function analyzeAndGenerateQueries(userQuestion, filter = "all", manualMode = "auto", apiKey) {
  const modelsAttempted = [];
  const cleanedQuestion = userQuestion.replace(/[؟?،!.,]/g, "").trim();
  const detectedMode = detectResearchMode(userQuestion, manualMode);
  const selectedMode = manualMode !== "auto" ? manualMode : detectedMode;
  const isOpposingRequested = detectOpposingRequested(userQuestion);
  const isComparative = detectComparativeQuestion(userQuestion);
  const hasArabicChars = /[\u0600-\u06FF]/.test(userQuestion);
  const isUrduSpecific = /[ٹڈڑںےہٹڈپچژکگ]/.test(userQuestion);
  const isRomanUrdu = !hasArabicChars && /[a-zA-Z]/.test(userQuestion);
  const language = isRomanUrdu ? "roman_urdu" : isUrduSpecific ? "urdu" : hasArabicChars ? "arabic" : "mixed";
  let detectedMainSubject = "\u0645\u0633\u0623\u0644\u0629 \u0634\u0631\u0639\u064A\u0629";
  let detectedDomain = filter === "usul" ? "\u0623\u0635\u0648\u0644 \u0627\u0644\u0641\u0642\u0647" : filter === "hanafi" ? "\u0627\u0644\u0641\u0642\u0647 \u0627\u0644\u062D\u0646\u0641\u064A" : "\u0627\u0644\u0641\u0642\u0647";
  const multiStrategyOffline = {
    exact: [],
    terminology: [],
    classicalArabic: [],
    synonyms: [],
    conceptual: [],
    reformulated: [],
    opposing: []
  };
  for (const rule of CONCEPT_RULES) {
    if (rule.triggerWords.some((tw) => isExactWordInText(tw, userQuestion))) {
      detectedMainSubject = rule.mainSubject;
      detectedDomain = rule.domain;
      multiStrategyOffline.exact.push(...rule.terms.exact);
      multiStrategyOffline.terminology.push(...rule.terms.terminology);
      multiStrategyOffline.classicalArabic.push(...rule.terms.classicalArabic);
      multiStrategyOffline.synonyms.push(...rule.terms.synonyms);
      multiStrategyOffline.conceptual.push(...rule.terms.conceptual);
      multiStrategyOffline.reformulated.push(...rule.terms.reformulated);
      if (isOpposingRequested) {
        multiStrategyOffline.opposing.push(...rule.terms.opposing);
      }
    }
  }
  const llmResult = await llmProvider.analyzeQuestion(userQuestion, filter, selectedMode, apiKey);
  if (llmResult && llmResult.queries) {
    const queries = llmResult.queries || {};
    const combinedLLMQueries = [
      ...queries.exact || [],
      ...queries.terminology || [],
      ...queries.classicalArabic || [],
      ...queries.synonyms || [],
      ...queries.conceptual || [],
      ...queries.reformulated || [],
      ...queries.opposing || []
    ];
    const normalizedRaw = combinedLLMQueries.map((q) => typeof q === "string" ? normalizeArabicText(q) : "").filter((q) => q.length > 2);
    const { validQueries: validQueries2, rejectedQueries: rejectedQueries2 } = validateAndFilterQueries(
      normalizedRaw,
      userQuestion
    );
    if (validQueries2.length > 0) {
      const intentObj = {
        keywords: validQueries2,
        language,
        targetFilter: filter,
        domain: llmResult.domain || detectedDomain,
        mainSubject: llmResult.mainSubject || detectedMainSubject,
        claim: llmResult.claim || "",
        requestedMadhhab: llmResult.requestedMadhhab || (filter === "hanafi" ? "\u0627\u0644\u062D\u0646\u0641\u064A" : void 0),
        isComparative: llmResult.isComparative || isComparative,
        isOpposingRequested,
        subQuestions: llmResult.subQuestions || [userQuestion],
        structuredAnalysis: llmResult.structuredAnalysis,
        multiStrategyQueries: {
          exact: (queries.exact || []).map(normalizeArabicText).filter(Boolean),
          terminology: (queries.terminology || []).map(normalizeArabicText).filter(Boolean),
          classicalArabic: (queries.classicalArabic || []).map(normalizeArabicText).filter(Boolean),
          synonyms: (queries.synonyms || []).map(normalizeArabicText).filter(Boolean),
          conceptual: (queries.conceptual || []).map(normalizeArabicText).filter(Boolean),
          reformulated: (queries.reformulated || []).map(normalizeArabicText).filter(Boolean),
          opposing: (queries.opposing || []).map(normalizeArabicText).filter(Boolean)
        },
        researchPlan: llmResult.researchPlan
      };
      intentObj.internalClassifications = classifyQueryInternally(userQuestion, intentObj, selectedMode);
      return {
        selectedMode,
        detectedMode,
        intent: intentObj,
        generatedQueries: Array.from(new Set(validQueries2)).slice(0, 8),
        rejectedQueries: rejectedQueries2,
        modelsAttempted: ["gemini-3.6-flash"]
      };
    }
  }
  const allOffline = Array.from(
    /* @__PURE__ */ new Set([
      ...multiStrategyOffline.exact,
      ...multiStrategyOffline.terminology,
      ...multiStrategyOffline.classicalArabic,
      ...multiStrategyOffline.synonyms,
      ...multiStrategyOffline.conceptual,
      ...multiStrategyOffline.reformulated,
      ...multiStrategyOffline.opposing,
      normalizeArabicText(cleanedQuestion)
    ])
  ).filter((q) => q.length > 2);
  const { validQueries, rejectedQueries } = validateAndFilterQueries(allOffline, userQuestion);
  const finalQueries = validQueries.length > 0 ? validQueries.slice(0, 8) : [normalizeArabicText(cleanedQuestion)];
  const fallbackIntent = {
    keywords: finalQueries,
    language,
    targetFilter: filter,
    domain: detectedDomain,
    mainSubject: detectedMainSubject,
    isComparative,
    isOpposingRequested,
    multiStrategyQueries: multiStrategyOffline
  };
  fallbackIntent.internalClassifications = classifyQueryInternally(userQuestion, fallbackIntent, selectedMode);
  return {
    selectedMode,
    detectedMode,
    intent: fallbackIntent,
    generatedQueries: finalQueries,
    rejectedQueries,
    modelsAttempted
  };
}

// server/nususService.ts
init_turathProvider();

// server/providers/embeddingProvider.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
var GeminiEmbeddingProvider = class {
  constructor() {
    this.ai = null;
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI2({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }
  }
  async getEmbedding(text) {
    if (!text || !text.trim()) {
      return null;
    }
    return this.computeFallbackTermVector(text);
  }
  computeCosineSimilarity(vecA, vecB) {
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
  computeFallbackTermVector(text) {
    const norm = normalizeArabicText(text);
    const tokens = norm.split(" ").filter((t) => t.length > 2);
    const vec = new Array(100).fill(0);
    for (const t of tokens) {
      let hash = 0;
      for (let i = 0; i < t.length; i++) {
        hash = (hash * 31 + t.charCodeAt(i)) % 100;
      }
      vec[Math.abs(hash)] += 1;
    }
    const sum = vec.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      return vec.map((v) => v / sum);
    }
    return vec;
  }
};
var embeddingProvider = new GeminiEmbeddingProvider();

// server/rerankerService.ts
var NON_HANAFI_CATEGORY_IDS = /* @__PURE__ */ new Set(["15", "16", "17"]);
var NON_HANAFI_AUTHOR_KEYWORDS = [
  "\u0627\u0644\u0647\u064A\u062A\u0645\u064A",
  "\u0627\u0628\u0646 \u062D\u062C\u0631 \u0627\u0644\u0647\u064A\u062A\u0645\u064A",
  "\u0627\u0644\u0646\u0648\u0648\u064A",
  "\u0627\u0644\u063A\u0632\u0627\u0644\u064A",
  "\u0627\u0644\u0631\u0627\u0641\u0639\u064A",
  "\u0627\u0644\u0645\u0627\u0648\u0631\u062F\u064A",
  "\u0627\u0644\u062C\u0648\u064A\u0646\u064A",
  "\u0627\u0644\u0634\u0627\u0641\u0639\u064A",
  "\u0627\u0644\u062E\u0637\u064A\u0628 \u0627\u0644\u0634\u0631\u0628\u064A\u0646\u064A",
  "\u0627\u0644\u0631\u0645\u0644\u064A",
  "\u0627\u0644\u0633\u064A\u0648\u0637\u064A",
  "\u0627\u0644\u0642\u0631\u0627\u0641\u064A",
  "\u0627\u0628\u0646 \u0631\u0634\u062F",
  "\u0627\u0644\u062D\u0637\u0627\u0628",
  "\u0627\u0644\u062F\u0631\u062F\u064A\u0631",
  "\u0627\u0644\u0628\u0627\u062C\u064A",
  "\u0627\u0628\u0646 \u0639\u0628\u062F \u0627\u0644\u0628\u0631",
  "\u0627\u0644\u0642\u0627\u0636\u064A \u0639\u064A\u0627\u0636",
  "\u0627\u0628\u0646 \u0642\u062F\u0627\u0645\u0629",
  "\u0627\u0644\u0628\u0647\u0648\u062A\u064A",
  "\u0627\u0628\u0646 \u062A\u064A\u0645\u064A\u0629",
  "\u0627\u0628\u0646 \u0627\u0644\u0642\u064A\u0645",
  "\u0627\u0644\u0645\u0631\u062F\u0627\u0648\u064A",
  "\u0627\u0644\u062E\u0631\u0642\u064A",
  "\u0627\u0628\u0646 \u0631\u062C\u0628",
  "\u0627\u0644\u0639\u0632 \u0628\u0646 \u0639\u0628\u062F \u0627\u0644\u0633\u0644\u0627\u0645"
];
var HANAFI_KEYWORD_TITLES = [
  "\u0631\u062F \u0627\u0644\u0645\u062D\u062A\u0627\u0631",
  "\u0627\u0644\u062F\u0631 \u0627\u0644\u0645\u062E\u062A\u0627\u0631",
  "\u0627\u0644\u0647\u062F\u0627\u064A\u0629",
  "\u0627\u0644\u0645\u0628\u0633\u0648\u0637",
  "\u0628\u062F\u0627\u0626\u0639 \u0627\u0644\u0635\u0646\u0627\u0626\u0639",
  "\u0627\u0644\u0628\u062D\u0631 \u0627\u0644\u0631\u0627\u0626\u0642",
  "\u0627\u0644\u0641\u062A\u0627\u0648\u0649 \u0627\u0644\u0647\u0646\u062F\u064A\u0629",
  "\u0645\u062C\u0645\u0639 \u0627\u0644\u0623\u0646\u0647\u0631",
  "\u0641\u062A\u062D \u0627\u0644\u0642\u062F\u064A\u0631",
  "\u0627\u0644\u0644\u0628\u0627\u0628 \u0641\u064A \u0634\u0631\u062D \u0627\u0644\u0643\u062A\u0627\u0628",
  "\u062A\u0646\u0648\u064A\u0631 \u0627\u0644\u0623\u0628\u0635\u0627\u0631",
  "\u06A9\u0646\u0632 \u0627\u0644\u062F\u0642\u0627\u0626\u0642",
  "\u0627\u0644\u062C\u0648\u0647\u0631\u0629 \u0627\u0644\u0646\u064A\u0631\u0629",
  "\u0634\u0631\u062D \u0641\u062A\u062D \u0627\u0644\u0642\u062F\u064A\u0631",
  "\u0623\u0635\u0648\u0644 \u0627\u0644\u0628\u0632\u062F\u0648\u064A",
  "\u0623\u0635\u0648\u0644 \u0627\u0644\u0633\u0631\u062E\u0633\u064A",
  "\u062A\u0623\u0633\u064A\u0633 \u0627\u0644\u0646\u0638\u0631",
  "\u0634\u0631\u062D \u0645\u0639\u0627\u0646\u064A \u0627\u0644\u0622\u062B\u0627\u0631",
  "\u0645\u062E\u062A\u0635\u0631 \u0627\u0644\u0642\u062F\u0648\u0631\u064A",
  "\u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0644\u062A\u0639\u0644\u064A\u0644 \u0627\u0644\u0645\u062E\u062A\u0627\u0631",
  "\u0627\u0644\u0628\u0646\u0627\u064A\u0629 \u0634\u0631\u062D \u0627\u0644\u0647\u062F\u0627\u064A\u0629",
  "\u0627\u0644\u062C\u0627\u0645\u0639 \u0627\u0644\u0635\u063A\u064A\u0631",
  "\u0627\u0644\u062C\u0627\u0645\u0639 \u0627\u0644\u0643\u0628\u064A\u0631",
  "\u0627\u0644\u0623\u0635\u0644",
  "\u062D\u0627\u0634\u064A\u0629 \u0627\u0628\u0646 \u0639\u0627\u0628\u062F\u064A\u0646",
  "\u062A\u0628\u064A\u064A\u0646 \u0627\u0644\u062D\u0642\u0627\u0626\u0642"
];
var SemanticRerankerProvider = class {
  async rerank(userQuestion, questionConcepts, candidates, options) {
    if (!candidates || candidates.length === 0) {
      return [];
    }
    const normQuestion = normalizeArabicText(userQuestion);
    const isHanafiRestricted = Boolean(options?.isHanafiRestricted);
    const selectedBookIds = options?.selectedBookIds;
    const selectedAuthorId = options?.selectedAuthorId;
    const isOpposingRequested = Boolean(options?.isOpposingRequested);
    const questionEmbedding = await embeddingProvider.getEmbedding(userQuestion);
    const isAskingAboutIjma = normQuestion.includes("\u0627\u062C\u0645\u0627\u0639") || normQuestion.includes("\u0625\u062C\u0645\u0627\u0639");
    const isAskingAboutHujjiya = normQuestion.includes("\u062D\u062C\u064A\u0629") || normQuestion.includes("\u062D\u062C\u064A\u062A") || normQuestion.includes("\u062D\u062C\u0629");
    const isAskingAboutHajj = normQuestion.includes("\u0645\u0646\u0627\u0633\u0643") || normQuestion.split(" ").some((w) => w === "\u062D\u062C" || w === "\u0627\u0644\u062D\u062C");
    const isAskingAboutMasah = normQuestion.includes("\u0645\u0633\u062D");
    const validCandidatesForEmbedding = candidates.filter((cand) => {
      const bookTitle = cand.bookTitle || cand.citation.book || "";
      const authorName = cand.authorName || cand.citation.author || "";
      const catId = cand.categoryId || cand.citation.category_id;
      const text = cand.passageText || cand.citation.arabic_text || "";
      const normText = normalizeArabicText(text);
      const normBook = normalizeArabicText(bookTitle);
      const normAuthor = normalizeArabicText(authorName);
      const bookIdStr = String(cand.bookId || cand.citation.book_id || "");
      if (selectedBookIds && selectedBookIds.length > 0) {
        if (!selectedBookIds.includes(bookIdStr)) {
          return false;
        }
      }
      if (selectedAuthorId) {
        const candidateAuthorId = String(cand.citation.author_id || "");
        if (candidateAuthorId !== String(selectedAuthorId)) {
          return false;
        }
      }
      if (isHanafiRestricted) {
        if (catId && NON_HANAFI_CATEGORY_IDS.has(String(catId))) {
          return false;
        }
        const isNonHanafiAuthor = NON_HANAFI_AUTHOR_KEYWORDS.some(
          (k) => normAuthor.includes(normalizeArabicText(k))
        );
        if (isNonHanafiAuthor) {
          return false;
        }
      }
      if ((isAskingAboutIjma || isAskingAboutHujjiya) && !isAskingAboutHajj) {
        const lacksIjmaOrUsul = !normText.includes("\u0627\u062C\u0645\u0627\u0639") && !normText.includes("\u0625\u062C\u0645\u0627\u0639") && !normText.includes("\u062D\u062C\u064A\u0629") && !normText.includes("\u062D\u062C\u0629") && !normText.includes("\u0627\u0635\u0648\u0644");
        if (lacksIjmaOrUsul && (normText.includes("\u0645\u0646\u0627\u0633\u0643") || normText.includes("\u0637\u0648\u0627\u0641") || normText.includes("\u0639\u0631\u0641\u0627\u062A") || normText.includes("\u0631\u0645\u064A \u0627\u0644\u062C\u0645\u0627\u0631"))) {
          return false;
        }
      }
      if (isAskingAboutMasah && normText.includes("\u0645\u0633\u064A\u062D") && !normText.includes("\u0631\u0623\u0633") && !normText.includes("\u062E\u0641\u064A\u0646")) {
        return false;
      }
      return true;
    });
    const scoredCandidates = validCandidatesForEmbedding.map((cand) => {
      const text = cand.passageText || cand.citation.arabic_text || "";
      const normText = normalizeArabicText(text);
      const bookTitle = cand.bookTitle || cand.citation.book || "";
      const normBook = normalizeArabicText(bookTitle);
      const catId = cand.categoryId || cand.citation.category_id;
      let localLexicalScore = 0;
      for (const concept of questionConcepts) {
        const normC = normalizeArabicText(concept);
        if (!normC) continue;
        if (normText.includes(normC)) {
          localLexicalScore += 30;
        } else {
          const cTokens = normC.split(" ").filter((t) => t.length > 2);
          const matched = cTokens.filter((t) => normText.includes(t));
          if (cTokens.length > 0 && matched.length === cTokens.length) {
            localLexicalScore += 20;
          } else {
            localLexicalScore += matched.length * 4;
          }
        }
      }
      if (isHanafiRestricted) {
        const isHanafiBook = HANAFI_KEYWORD_TITLES.some(
          (h) => normBook.includes(normalizeArabicText(h))
        );
        if (isHanafiBook || catId === "14") {
          localLexicalScore += 25;
        }
      }
      if (isOpposingRequested) {
        if (normText.includes("\u0644\u064A\u0633 \u0628\u062D\u062C\u0629") || normText.includes("\u0623\u0646\u0643\u0631") || normText.includes("\u062E\u0627\u0644\u0641") || normText.includes("\u0645\u0646\u0627\u0642\u0634\u0629")) {
          localLexicalScore += 25;
        }
      }
      if (text.length >= 200 && text.length <= 3500) {
        localLexicalScore += 10;
      }
      return { cand, localLexicalScore };
    });
    scoredCandidates.sort((a, b) => b.localLexicalScore - a.localLexicalScore);
    const embeddingCandidates = scoredCandidates.slice(0, 10).map((sc) => sc.cand);
    const embeddingPromises = embeddingCandidates.map(async (cand) => {
      const text = cand.passageText || cand.citation.arabic_text || "";
      if (!text.trim()) return null;
      try {
        return await embeddingProvider.getEmbedding(text);
      } catch (err) {
        return null;
      }
    });
    const passageEmbeddings = await Promise.all(embeddingPromises);
    const embeddingMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < embeddingCandidates.length; i++) {
      const cand = embeddingCandidates[i];
      const text = cand.passageText || cand.citation.arabic_text || "";
      const emb = passageEmbeddings[i];
      if (emb) {
        embeddingMap.set(text, emb);
      }
    }
    const rerankedList = [];
    for (const cand of candidates) {
      const bookTitle = cand.bookTitle || cand.citation.book || "";
      const authorName = cand.authorName || cand.citation.author || "";
      const catId = cand.categoryId || cand.citation.category_id;
      const text = cand.passageText || cand.citation.arabic_text || "";
      const normText = normalizeArabicText(text);
      const normBook = normalizeArabicText(bookTitle);
      const normAuthor = normalizeArabicText(authorName);
      const bookIdStr = String(cand.bookId || cand.citation.book_id || "");
      if (selectedBookIds && selectedBookIds.length > 0) {
        if (!selectedBookIds.includes(bookIdStr)) {
          continue;
        }
      }
      if (selectedAuthorId) {
        const candidateAuthorId = String(cand.citation.author_id || "");
        if (candidateAuthorId !== String(selectedAuthorId)) {
          rerankedList.push({
            citation: cand.citation,
            score: 0,
            semanticSimilarity: 0,
            evidenceLevel: "INSUFFICIENT",
            evidenceLabelUrdu: "\u0645\u0633\u062A\u0628\u0639\u062F (\u063A\u06CC\u0631 \u0645\u0646\u062A\u062E\u0628 \u0645\u0635\u0646\u0641)",
            rejectionReason: `Author ID (${candidateAuthorId}) does not match selected author ID (${selectedAuthorId})`
          });
          continue;
        }
      }
      if (isHanafiRestricted) {
        if (catId && NON_HANAFI_CATEGORY_IDS.has(String(catId))) {
          rerankedList.push({
            citation: cand.citation,
            score: 0,
            semanticSimilarity: 0,
            evidenceLevel: "INSUFFICIENT",
            evidenceLabelUrdu: "\u0645\u0633\u062A\u0628\u0639\u062F (\u063A\u06CC\u0631 \u062D\u0646\u0641\u06CC \u062A\u0635\u0646\u06CC\u0641)",
            rejectionReason: `Non-Hanafi category (${catId}) excluded under Hanafi filter`
          });
          continue;
        }
        const isNonHanafiAuthor = NON_HANAFI_AUTHOR_KEYWORDS.some(
          (k) => normAuthor.includes(normalizeArabicText(k))
        );
        if (isNonHanafiAuthor) {
          rerankedList.push({
            citation: cand.citation,
            score: 0,
            semanticSimilarity: 0,
            evidenceLevel: "INSUFFICIENT",
            evidenceLabelUrdu: "\u0645\u0633\u062A\u0628\u0639\u062F (\u0645\u0624\u0644\u0641 \u063A\u06CC\u0631 \u062D\u0646\u0641\u06CC)",
            rejectionReason: `Non-Hanafi author (${authorName}) excluded under Hanafi filter`
          });
          continue;
        }
      }
      if ((isAskingAboutIjma || isAskingAboutHujjiya) && !isAskingAboutHajj) {
        const lacksIjmaOrUsul = !normText.includes("\u0627\u062C\u0645\u0627\u0639") && !normText.includes("\u0625\u062C\u0645\u0627\u0639") && !normText.includes("\u062D\u062C\u064A\u0629") && !normText.includes("\u062D\u062C\u0629") && !normText.includes("\u0627\u0635\u0648\u0644");
        if (lacksIjmaOrUsul && (normText.includes("\u0645\u0646\u0627\u0633\u0643") || normText.includes("\u0637\u0648\u0627\u0641") || normText.includes("\u0639\u0631\u0641\u0627\u062A") || normText.includes("\u0631\u0645\u064A \u0627\u0644\u062C\u0645\u0627\u0631"))) {
          rerankedList.push({
            citation: cand.citation,
            score: 0,
            semanticSimilarity: 0,
            evidenceLevel: "INSUFFICIENT",
            evidenceLabelUrdu: "\u0645\u0633\u062A\u0628\u0639\u062F (\u0639\u06CC\u0646 \u0645\u0646\u0627\u0633\u06A9 \u062D\u062C)",
            rejectionReason: "Pure Hajj pilgrimage passage rejected when user asked about Usul/Ijma"
          });
          continue;
        }
      }
      if (isAskingAboutMasah && normText.includes("\u0645\u0633\u064A\u062D") && !normText.includes("\u0631\u0623\u0633") && !normText.includes("\u062E\u0641\u064A\u0646")) {
        rerankedList.push({
          citation: cand.citation,
          score: 0,
          semanticSimilarity: 0,
          evidenceLevel: "INSUFFICIENT",
          evidenceLabelUrdu: "\u0645\u0633\u062A\u0628\u0639\u062F (\u0644\u0641\u0638\u06CC \u0645\u063A\u0627\u0644\u0637\u06C1)",
          rejectionReason: "Morphological guard: '\u0645\u0633\u062D' (wiping) confused with '\u0645\u0633\u064A\u062D' (Messiah)"
        });
        continue;
      }
      let baseScore = 0;
      let directPhraseMatch = false;
      for (const concept of questionConcepts) {
        const normC = normalizeArabicText(concept);
        if (!normC) continue;
        if (normText.includes(normC)) {
          baseScore += 30;
          directPhraseMatch = true;
        } else {
          const cTokens = normC.split(" ").filter((t) => t.length > 2);
          const matched = cTokens.filter((t) => normText.includes(t));
          if (cTokens.length > 0 && matched.length === cTokens.length) {
            baseScore += 20;
          } else {
            baseScore += matched.length * 4;
          }
        }
      }
      let simScorePercent = 0;
      if (questionEmbedding) {
        const passageEmbedding = embeddingMap.get(text);
        if (passageEmbedding) {
          const sim = embeddingProvider.computeCosineSimilarity(
            questionEmbedding,
            passageEmbedding
          );
          simScorePercent = Math.round(sim * 100);
          baseScore += Math.round(sim * 35);
        }
      }
      if (isHanafiRestricted) {
        const isHanafiBook = HANAFI_KEYWORD_TITLES.some(
          (h) => normBook.includes(normalizeArabicText(h))
        );
        if (isHanafiBook || catId === "14") {
          baseScore += 25;
        }
      }
      if (isOpposingRequested) {
        if (normText.includes("\u0644\u064A\u0633 \u0628\u062D\u062C\u0629") || normText.includes("\u0623\u0646\u0643\u0631") || normText.includes("\u062E\u0627\u0644\u0641") || normText.includes("\u0645\u0646\u0627\u0642\u0634\u0629")) {
          baseScore += 25;
        }
      }
      if (text.length >= 200 && text.length <= 3500) {
        baseScore += 10;
      }
      let evidenceLevel = "INSUFFICIENT";
      let evidenceLabelUrdu = "\u063A\u06CC\u0631 \u06A9\u0627\u0641\u06CC";
      if (directPhraseMatch || baseScore >= 45 || simScorePercent >= 65) {
        evidenceLevel = "DIRECT";
        evidenceLabelUrdu = "\u0628\u0631\u0627\u06C1\u0650 \u0631\u0627\u0633\u062A (\u0635\u0631\u064A\u062D)";
      } else if (baseScore >= 30 || simScorePercent >= 45) {
        evidenceLevel = "SUPPORTING";
        evidenceLabelUrdu = "\u0645\u0624\u06CC\u062F (\u062A\u0627\u0626\u064A\u062F\u06CC)";
      } else if (baseScore >= 20 || simScorePercent >= 30) {
        evidenceLevel = "INDIRECT";
        evidenceLabelUrdu = "\u0628\u0627\u0644\u0648\u0627\u0633\u0637\u06C1 (\u0636\u0645\u0646\u06CC)";
      } else if (baseScore >= 12) {
        evidenceLevel = "POSSIBLE_INFERENCE";
        evidenceLabelUrdu = "\u0627\u0633\u062A\u062F\u0644\u0627\u0644\u06CC (\u0627\u062D\u062A\u0645\u0627\u0644\u06CC)";
      }
      const updatedCitation = {
        ...cand.citation,
        score: baseScore,
        similarity_score: simScorePercent,
        evidence_level: evidenceLevel,
        evidence_label_urdu: evidenceLabelUrdu
      };
      rerankedList.push({
        citation: updatedCitation,
        score: baseScore,
        semanticSimilarity: simScorePercent,
        evidenceLevel,
        evidenceLabelUrdu
      });
    }
    rerankedList.sort((a, b) => b.score - a.score);
    return rerankedList;
  }
};
var rerankerProvider = new SemanticRerankerProvider();

// server/nususService.ts
var CATEGORY_MAP = {
  all: [],
  hanafi: ["14"],
  // Category 14: الفقه الحنفي
  hadith: ["6", "7"],
  // 6: كتب السنة, 7: شروح الحديث
  tafsir: ["3", "4"],
  // 3: التفسير, 4: علوم القرآن
  usul: ["11", "12"],
  // 11: أصول الفقه, 12: علوم الفقه والقواعد الفقهية
  custom: []
};
async function retrieveNususPassages(arabicQueries, userQuestion, filter = "all", options) {
  const queriesUsed = [];
  const rawCandidatePassages = [];
  const rejectedSources = [];
  const selectedCategoryId = options?.categoryId;
  const selectedCategoryIds = options?.categoryIds;
  const selectedBookIds = options?.bookIds && options.bookIds.length > 0 ? options.bookIds : void 0;
  const selectedAuthorId = options?.authorId;
  const isOpposingRequested = options?.isOpposingRequested || false;
  const isHanafiRestricted = filter === "hanafi" || selectedCategoryId === "14" || selectedCategoryIds && selectedCategoryIds.includes("14");
  const activeCategoryIds = [];
  if (selectedCategoryIds && selectedCategoryIds.length > 0) {
    activeCategoryIds.push(...selectedCategoryIds);
  } else if (selectedCategoryId) {
    activeCategoryIds.push(selectedCategoryId);
  } else if (CATEGORY_MAP[filter] && CATEGORY_MAP[filter].length > 0) {
    activeCategoryIds.push(...CATEGORY_MAP[filter]);
  }
  const candidateKeysSeen = /* @__PURE__ */ new Set();
  const addCandidate = (p) => {
    if (!p || !p.text) return;
    const bookId = String(p.book?.id || "0");
    const internalPage = p.location?.internalPage || p.location?.printedPage || 1;
    const key = `${bookId}_${internalPage}`;
    if (candidateKeysSeen.has(key)) return;
    candidateKeysSeen.add(key);
    const bookTitle = p.book?.title || "\u0643\u062A\u0627\u0628 \u063A\u064A\u0631 \u0645\u0633\u0645\u0649";
    const authorName = p.author?.name || "\u0645\u0635\u0646\u0641 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641";
    const catId = p.category?.id ? String(p.category.id) : void 0;
    const printedPage = p.location?.printedPage;
    const vol = p.location?.volume;
    const volStr = vol ? `\u062C ${vol}\u060C ` : "";
    const pageStr = printedPage ? `\u0635 ${printedPage} (\u0635\u0641\u062D\u0629 \u062A\u0631\u0627\u062B ${internalPage})` : `\u0635\u0641\u062D\u0629 \u062A\u0631\u0627\u062B ${internalPage}`;
    const locator = `${volStr}${pageStr}`;
    const citationObj = {
      book_id: p.book?.id || 0,
      book: bookTitle,
      author: authorName,
      locator,
      page: printedPage || internalPage,
      internalPage,
      printedPage,
      vol: vol ? String(vol) : void 0,
      arabic_text: (p.text || "").trim(),
      original_arabic_verbatim: (p.text || "").trim(),
      url: p.url || `https://app.turath.io/book/${p.book?.id}?page=${internalPage}`,
      shamela_url: p.alternateUrls?.shamela,
      headings: p.headings || [],
      citation: p.citation,
      category_id: catId,
      author_id: p.author?.id ? String(p.author.id) : void 0
    };
    rawCandidatePassages.push({
      citation: citationObj,
      passageText: (p.text || "").trim(),
      bookTitle,
      authorName,
      categoryId: catId,
      bookId
    });
  };
  if (selectedBookIds && selectedBookIds.length > 0) {
    const activeBooks = selectedBookIds.slice(0, 16);
    let maxQueries = 2;
    if (activeBooks.length <= 2) {
      maxQueries = 4;
    } else if (activeBooks.length <= 5) {
      maxQueries = 3;
    }
    const activeQueries = arabicQueries.slice(0, maxQueries);
    const retrievalPromises = [];
    for (const bookId of activeBooks) {
      for (const query of activeQueries) {
        if (!query.trim()) continue;
        retrievalPromises.push((async () => {
          try {
            queriesUsed.push(`${query} [book:${bookId}]`);
            const res = await turathProvider.retrieve(query.trim(), {
              scope: {
                bookIds: [Number(bookId)],
                ...selectedAuthorId ? { authorIds: [Number(selectedAuthorId)] } : {}
              },
              maxPassages: 8,
              maxCharsPerPassage: 3e3
            });
            if (res && res.passages) {
              for (const passage of res.passages) {
                addCandidate(passage);
              }
            }
          } catch (err) {
            console.warn(`[Nusus] Retrieve book:${bookId} query "${query}" failed:`, err?.message || err);
          }
        })());
      }
    }
    await Promise.all(retrievalPromises);
  } else {
    if (activeCategoryIds.length > 0) {
      const categoryPromises = [];
      const priorityQueries = arabicQueries.slice(0, 4);
      for (const catId of activeCategoryIds) {
        for (const query of priorityQueries) {
          if (!query.trim()) continue;
          categoryPromises.push((async () => {
            try {
              queriesUsed.push(`${query} [cat:${catId}]`);
              const res = await turathProvider.retrieve(query.trim(), {
                scope: {
                  categoryIds: [Number(catId)],
                  ...selectedAuthorId ? { authorIds: [Number(selectedAuthorId)] } : {}
                },
                maxPassages: 8,
                maxCharsPerPassage: 3e3
              });
              if (res && res.passages) {
                for (const passage of res.passages) {
                  addCandidate(passage);
                }
              }
            } catch (err) {
              console.warn(`[Nusus] Retrieve cat:${catId} query "${query}" failed:`, err?.message || err);
            }
          })());
        }
      }
      await Promise.all(categoryPromises);
    }
    if (rawCandidatePassages.length < 15) {
      const generalPromises = [];
      const priorityQueries = arabicQueries.slice(0, 5);
      for (const query of priorityQueries) {
        if (!query.trim()) continue;
        generalPromises.push((async () => {
          try {
            queriesUsed.push(query);
            const res = await turathProvider.retrieve(query.trim(), {
              ...selectedAuthorId ? { scope: { authorIds: [Number(selectedAuthorId)] } } : {},
              maxPassages: 8,
              maxCharsPerPassage: 3e3
            });
            if (res && res.passages) {
              for (const passage of res.passages) {
                addCandidate(passage);
              }
            }
          } catch (err) {
            console.warn(`[Nusus] Retrieve general query "${query}" failed:`, err?.message || err);
          }
        })());
      }
      await Promise.all(generalPromises);
    }
  }
  const rawHitsCount = rawCandidatePassages.length;
  if (rawHitsCount === 0) {
    return {
      passages: [],
      queriesUsed: Array.from(new Set(queriesUsed)),
      rawHitsCount: 0,
      rejectedSources: [],
      evidenceCounts: {}
    };
  }
  const rerankedCandidates = await rerankerProvider.rerank(
    userQuestion,
    arabicQueries,
    rawCandidatePassages,
    {
      isHanafiRestricted,
      selectedBookIds,
      selectedAuthorId,
      isOpposingRequested
    }
  );
  for (const item of rerankedCandidates) {
    if (item.rejectionReason) {
      rejectedSources.push({
        book: item.citation.book,
        reason: item.rejectionReason
      });
    }
  }
  const MIN_RELEVANCE_SCORE = 12;
  const validReranked = rerankedCandidates.filter(
    (item) => !item.rejectionReason && item.score >= MIN_RELEVANCE_SCORE
  );
  if (validReranked.length === 0) {
    return {
      passages: [],
      queriesUsed: Array.from(new Set(queriesUsed)),
      rawHitsCount,
      rejectedSources,
      evidenceCounts: {}
    };
  }
  const topCandidates = validReranked.slice(0, 6);
  const contextPromises = topCandidates.map(async (item) => {
    const citation = item.citation;
    const text = citation.arabic_text || "";
    if (text.length < 250 && citation.internalPage && citation.book_id) {
      try {
        const pageData = await turathProvider.getPage(citation.book_id, citation.internalPage);
        if (pageData && pageData.text && pageData.text.length > text.length) {
          citation.arabic_text = pageData.text.trim();
          citation.original_arabic_verbatim = pageData.text.trim();
        }
      } catch (err) {
      }
    }
  });
  await Promise.all(contextPromises);
  const finalPassages = topCandidates.map((item) => item.citation);
  const evidenceCounts = {};
  for (const p of finalPassages) {
    const level = p.evidence_level || "SUPPORTING";
    evidenceCounts[level] = (evidenceCounts[level] || 0) + 1;
  }
  return {
    passages: finalPassages,
    queriesUsed: Array.from(new Set(queriesUsed)),
    rawHitsCount,
    rejectedSources,
    evidenceCounts
  };
}

// server/aiService.ts
import { GoogleGenAI as GoogleGenAI3 } from "@google/genai";
async function synthesizeUrduResearchAnswer(userQuestion, passages, modeInfo, apiKey) {
  if (!passages || passages.length === 0) {
    return {
      answer: {
        summary: "\u062F\u0633\u062A\u06CC\u0627\u0628 \u0645\u0635\u0627\u062F\u0631 \u0645\u06CC\u06BA \u0627\u0633 \u0633\u0648\u0627\u0644 \u06A9\u06D2 \u0644\u06CC\u06D2 \u0648\u0627\u0636\u062D \u0627\u0648\u0631 \u0642\u0627\u0628\u0644\u0650 \u0627\u0639\u062A\u0645\u0627\u062F \u0639\u0628\u0627\u0631\u062A \u0646\u06C1\u06CC\u06BA \u0645\u0644 \u0633\u06A9\u06CC\u06D4",
        detail: `### \u062C\u0648\u0627\u0628
\u062F\u0633\u062A\u06CC\u0627\u0628 \u06A9\u0644\u0627\u0633\u06CC\u06A9\u06CC \u0645\u0635\u0627\u062F\u0631 \u0645\u06CC\u06BA \u0627\u0633 \u0645\u062E\u0635\u0648\u0635 \u0633\u0648\u0627\u0644 \u06A9\u06D2 \u0644\u06CC\u06D2 \u0635\u0631\u06CC\u062D \u0639\u0628\u0627\u0631\u062A \u0646\u06C1\u06CC\u06BA \u0645\u0644 \u0633\u06A9\u06CC\u06D4

### \u0645\u0635\u0627\u062F\u0631 \u0648 \u0645\u0631\u0627\u062C\u0639
\u062A\u0644\u0627\u0634 \u06A9\u06D2 \u062F\u0627\u0626\u0631\u06D2 \u0645\u06CC\u06BA \u0634\u0627\u0645\u0644 \u06A9\u062A\u0628 \u0633\u06D2 \u0627\u0633 \u0639\u0646\u0648\u0627\u0646 \u06A9\u06D2 \u062A\u062D\u062A \u0628\u0631\u0627\u06C1\u0650 \u0631\u0627\u0633\u062A \u0639\u0628\u0627\u0631\u062A \u062F\u0633\u062A\u06CC\u0627\u0628 \u0646\u06C1\u06CC\u06BA \u06C1\u0648\u0626\u06CC\u06D4 \u0628\u0631\u0627\u06C1\u0650 \u06A9\u0631\u0645 \u0627\u0644\u0641\u0627\u0638 \u0645\u06CC\u06BA \u062A\u0628\u062F\u06CC\u0644\u06CC \u06A9\u0631 \u06A9\u06D2 \u06CC\u0627 \u06A9\u062A\u0628 \u06A9\u0627 \u062F\u0627\u0626\u0631\u06C1 \u06A9\u0627\u0631 \u0648\u0633\u06CC\u0639 \u06A9\u0631 \u06A9\u06D2 \u062F\u0648\u0628\u0627\u0631\u06C1 \u06A9\u0648\u0634\u0634 \u0641\u0631\u0645\u0627\u0626\u06CC\u06BA\u06D4`,
        istidlal_arabic: "",
        insufficient: true
      },
      modelsAttempted: []
    };
  }
  const modelsAttempted = ["gemini-3.6-flash"];
  try {
    const result = await llmProvider.synthesizeAnswer(userQuestion, passages, modeInfo?.isComparative, apiKey);
    if (result) {
      return {
        answer: {
          summary: result.summary,
          detail: result.detail,
          istidlal_arabic: result.istidlal_arabic,
          insufficient: result.insufficient,
          evidenceAnalysis: result.evidenceAnalysis,
          finalResearchAssessment: result.finalResearchAssessment
        },
        modelsAttempted
      };
    }
  } catch (err) {
    console.warn(`[aiService] llmProvider synthesis failed:`, err?.message || err);
  }
  const topPassage = passages[0];
  const summaryText = `\u062C\u0648\u0627\u0628: ${topPassage.book} \u0633\u06D2 \u062D\u0627\u0635\u0644 \u06A9\u0631\u062F\u06C1 \u062F\u0644\u06CC\u0644 \u06A9\u06CC \u0631\u0648\u0634\u0646\u06CC \u0645\u06CC\u06BA \u062A\u0641\u0635\u06CC\u0644\u06CC \u062C\u0627\u0626\u0632\u06C1 \u062F\u0631\u062C \u0630\u06CC\u0644 \u06C1\u06D2\u06D4`;
  const fallbackDetail = passages.map(
    (p) => `### \u0627\u0635\u0644 \u0639\u0628\u0627\u0631\u062A
${p.arabic_text}

### \u062A\u0631\u062C\u0645\u06C1
\u062A\u0631\u062C\u0645\u06C1 \u0627\u0633 \u0648\u0642\u062A \u062F\u0633\u062A\u06CC\u0627\u0628 \u0646\u06C1\u06CC\u06BA \u06C1\u06D2\u06D4 \u0627\u0635\u0644 \u0639\u0631\u0628\u06CC \u0639\u0628\u0627\u0631\u062A \u0627\u0648\u067E\u0631 \u062F\u0631\u062C \u06C1\u06D2\u06D4

### \u062D\u0648\u0627\u0644\u06C1
\u06A9\u062A\u0627\u0628: ${p.book}
\u0645\u0635\u0646\u0641: ${p.author}
\u0645\u0642\u0627\u0645: ${p.locator}
\u0644\u0646\u06A9: ${p.url}`
  ).join("\n\n---\n\n");
  const fullDetail = `### \u062C\u0648\u0627\u0628
\u062F\u0633\u062A\u06CC\u0627\u0628 \u06A9\u0644\u0627\u0633\u06CC\u06A9\u06CC \u0645\u0635\u0627\u062F\u0631 \u06A9\u06D2 \u0645\u0637\u0627\u0644\u0639\u06C1 \u0633\u06D2 \u062D\u0627\u0635\u0644 \u0634\u062F\u06C1 \u0646\u062A\u0627\u0626\u062C \u062F\u0631\u062C \u0630\u06CC\u0644 \u06C1\u06CC\u06BA:

### \u062F\u0644\u0627\u0626\u0644 \u0648 \u0648\u0636\u0627\u062D\u062A
\u0627\u0633\u062A\u062E\u0631\u0627\u062C \u06A9\u0631\u062F\u06C1 \u0639\u0628\u0627\u0631\u0627\u062A \u06A9\u06D2 \u0645\u0637\u0627\u0628\u0642 \u0627\u0633 \u0645\u0633\u0626\u0644\u06D2 \u06A9\u06CC \u0648\u0636\u0627\u062D\u062A \u0630\u06CC\u0644 \u06A9\u06D2 \u0645\u0635\u0627\u062F\u0631\u0650 \u0627\u0635\u0644 \u0633\u06D2 \u06A9\u06CC \u062C\u0627\u062A\u06CC \u06C1\u06D2:

${fallbackDetail}

### \u0645\u0635\u0627\u062F\u0631 \u0648 \u0645\u0631\u0627\u062C\u0639
${passages.map((p) => `- ${p.book} (${p.author})`).join("\n")}`;
  return {
    answer: {
      summary: summaryText,
      detail: fullDetail,
      istidlal_arabic: topPassage?.arabic_text?.substring(0, 180) || "",
      insufficient: false
    },
    modelsAttempted
  };
}

// server/researchPlanner.ts
function createResearchPlan(question, filter = "all", options, intent) {
  const norm = question.toLowerCase();
  const subQuestions = intent?.subQuestions || [];
  const keyConcepts = intent?.structuredAnalysis?.key_concepts || [];
  const requiredEvidenceTypes = intent?.researchPlan?.required_evidence_types || ["DIRECT_RULING"];
  const searchStrategies = [];
  const conditionsToVerify = intent?.researchPlan?.required_conditions || [];
  const exceptionsToVerify = intent?.researchPlan?.required_exceptions || [];
  const exclusions = intent?.structuredAnalysis?.exclusions || [];
  const questionType = [];
  if (subQuestions.length === 0) {
    const splitters = /[؟?؛;]/;
    const rawParts = question.split(splitters).map((p) => p.trim()).filter((p) => p.length > 5);
    if (rawParts.length > 1) {
      subQuestions.push(...rawParts);
    } else {
      const andParts = question.split(/\s+اور\s+/).map((p) => p.trim()).filter((p) => p.length > 5);
      if (andParts.length > 1) {
        subQuestions.push(...andParts);
      } else {
        subQuestions.push(question);
      }
    }
  }
  if (keyConcepts.length === 0) {
    if (norm.includes("\u0627\u062C\u0645\u0627\u0639") || norm.includes("\u0625\u062C\u0645\u0627\u0639")) {
      keyConcepts.push("\u0627\u0644\u0625\u062C\u0645\u0627\u0639");
      questionType.push("EVIDENCE", "SOURCE_IDENTIFICATION");
      searchStrategies.push("Terminology search", "Conceptual search");
    }
    if (norm.includes("\u0642\u06CC\u0627\u0633") || norm.includes("\u0642\u064A\u0627\u0633")) {
      keyConcepts.push("\u0627\u0644\u0642\u064A\u0627\u0633");
      questionType.push("EVIDENCE", "DEFINITION");
      searchStrategies.push("Terminology search", "Cause/illah search");
    }
    if (norm.includes("\u0627\u0633\u062A\u062D\u0633\u0627\u0646")) {
      keyConcepts.push("\u0627\u0644\u0627\u0633\u062A\u062D\u0633\u0627\u0646");
      questionType.push("EVIDENCE", "EXCEPTION");
      searchStrategies.push("Conceptual search");
    }
    if (norm.includes("\u0648\u0636\u0648") || norm.includes("\u0648\u0636\u0648\u0621")) {
      keyConcepts.push("\u0627\u0644\u0648\u0636\u0648\u0621");
      questionType.push("DIRECT_RULING", "CONDITION");
    }
    if (norm.includes("\u0645\u0633\u062D")) {
      keyConcepts.push("\u0627\u0644\u0645\u0633\u062D");
      questionType.push("DIRECT_RULING", "QUANTITY");
    }
    if (norm.includes("\u062D\u062C") || norm.includes("\u0627\u062D\u0631\u0627\u0645") || norm.includes("\u0625\u062D\u0631\u0627\u0645")) {
      keyConcepts.push("\u0627\u0644\u062D\u062C", "\u0627\u0644\u0625\u062D\u0631\u0627\u0645");
      questionType.push("DIRECT_RULING", "FATWA");
    }
  }
  if (conditionsToVerify.length === 0 && (norm.includes("\u0627\u06AF\u0631") || norm.includes("\u0628\u0634\u0631\u0637") || norm.includes("\u0634\u0631\u0637") || norm.includes("\u0635\u0648\u0631\u062A"))) {
    conditionsToVerify.push("\u0634\u0631\u0637 \u0635\u062D\u062A", "\u062D\u0627\u0644\u062A / \u0635\u0648\u0631\u062A");
    searchStrategies.push("Condition search", "Qualification search");
    if (!requiredEvidenceTypes.includes("CONDITION")) requiredEvidenceTypes.push("CONDITION");
    if (!questionType.includes("CONDITION")) questionType.push("CONDITION");
  }
  if (exceptionsToVerify.length === 0 && (norm.includes("\u0645\u062C\u0628\u0648\u0631\u06CC") || norm.includes("\u0636\u0631\u0648\u0631\u062A") || norm.includes("\u0639\u0630\u0631") || norm.includes("\u0627\u0633\u062A\u062B\u0646\u0627"))) {
    exceptionsToVerify.push("\u062D\u0627\u0644\u062A \u0636\u0631\u0648\u0631\u062A", "\u0639\u0630\u0631 \u0634\u0631\u0639\u064A");
    searchStrategies.push("Exception search");
    if (!requiredEvidenceTypes.includes("EXCEPTION")) requiredEvidenceTypes.push("EXCEPTION");
    if (!questionType.includes("EXCEPTION")) questionType.push("EXCEPTION");
  }
  if (norm.includes("\u0641\u062F\u06CC\u06C1") || norm.includes("\u062C\u0632\u0627") || norm.includes("\u062F\u0645")) {
    if (!keyConcepts.includes("\u0627\u0644\u0641\u062F\u064A\u0629")) keyConcepts.push("\u0627\u0644\u0641\u062F\u064A\u0629", "\u0627\u0644\u062F\u0645");
    if (!requiredEvidenceTypes.includes("CONSEQUENCE")) requiredEvidenceTypes.push("CONSEQUENCE");
    if (!questionType.includes("CONSEQUENCE")) questionType.push("CONSEQUENCE");
  }
  if (questionType.length === 0) {
    questionType.push("DIRECT_RULING");
  }
  let sourceScope = "All classical Islamic works";
  if (options?.bookIds && options.bookIds.length > 0) {
    sourceScope = `Restricted to specific books: ${options.bookIds.join(", ")}`;
  } else if (filter === "hanafi" || options?.categoryId === "14") {
    sourceScope = "Strictly restricted to Hanafi Fiqh category";
  } else if (filter !== "all") {
    sourceScope = `Restricted to filter category: ${filter}`;
  }
  let researchDepth = "level1";
  const levelNum = intent?.researchPlan?.research_level;
  if (levelNum === 3) {
    researchDepth = "level3";
  } else if (levelNum === 2) {
    researchDepth = "level2";
  } else if (levelNum === 1) {
    researchDepth = "level1";
  } else {
    const isComparative = norm.includes("\u0627\u062E\u062A\u0644\u0627\u0641") || norm.includes("\u0645\u0630\u0627\u06C1\u0628") || norm.includes("\u062D\u0646\u0641\u06CC \u0627\u0648\u0631");
    const isComplexMultiPart = subQuestions.length > 2 || conditionsToVerify.length > 0 && exceptionsToVerify.length > 0;
    if (isComparative || isComplexMultiPart || norm.includes("\u06A9\u06CC\u0648\u06BA") || norm.includes("\u062F\u0644\u06CC\u0644")) {
      researchDepth = "level3";
    } else if (conditionsToVerify.length > 0 || exceptionsToVerify.length > 0 || norm.includes("\u0645\u062E\u0627\u0644\u0641")) {
      researchDepth = "level2";
    } else {
      researchDepth = "level1";
    }
  }
  const researchTasks = intent?.researchPlan?.search_tasks || [];
  if (researchTasks.length === 0) {
    researchTasks.push(`Analyze core ruling for question: "${question}"`);
    subQuestions.forEach((sub, idx) => {
      if (sub !== question) {
        researchTasks.push(`Investigate sub-component ${idx + 1}: "${sub}"`);
      }
    });
  }
  let complexity = "SIMPLE";
  if (researchDepth === "level3") {
    complexity = "COMPLEX";
  } else if (researchDepth === "level2") {
    complexity = "MODERATE";
  }
  const stormPerspectives = [];
  if (complexity !== "SIMPLE") {
    stormPerspectives.push("\u0627\u0635\u0644 \u062D\u06A9\u0645");
    if (norm.includes("\u062D\u062C") || norm.includes("\u0627\u062D\u0631\u0627\u0645")) {
      stormPerspectives.push("\u0627\u062D\u0631\u0627\u0645 \u06A9\u0627 \u0627\u062B\u0631", "\u0627\u0633\u062A\u0639\u0645\u0627\u0644 \u06A9\u06CC \u0635\u0648\u0631\u062A", "\u0636\u0631\u0648\u0631\u062A/\u0639\u0630\u0631", "\u0641\u0642\u06C1 \u062D\u0646\u0641\u06CC \u06A9\u06CC \u0642\u06CC\u062F");
    } else if (norm.includes("\u0648\u0636\u0648") || norm.includes("\u063A\u0633\u0644") || norm.includes("\u062A\u06CC\u0645\u0645") || norm.includes("\u0645\u0633\u062D")) {
      stormPerspectives.push("\u0634\u0631\u0627\u0626\u0637 \u0635\u062D\u062A", "\u0645\u0641\u0633\u062F\u0627\u062A / \u0646\u0648\u0627\u0642\u0636", "\u0637\u06C1\u0627\u0631\u062A \u06A9\u06CC \u0635\u0648\u0631\u062A");
    } else if (norm.includes("\u0631\u0648\u0632\u06C1") || norm.includes("\u0635\u0648\u0645")) {
      stormPerspectives.push("\u0634\u0631\u0627\u0626\u0637 \u0631\u0648\u0632\u06C1", "\u0645\u0641\u0633\u062F\u0627\u062A \u0631\u0648\u0632\u06C1", "\u0631\u062E\u0635\u062A / \u0639\u0630\u0631 \u0634\u0631\u0639\u06CC", "\u0642\u0636\u0627 \u0648 \u0641\u062F\u06CC\u06C1");
    } else if (norm.includes("\u0632\u06A9\u0648\u06C3") || norm.includes("\u0635\u062F\u0642\u06C1")) {
      stormPerspectives.push("\u0634\u0631\u0637 \u0648\u062C\u0648\u0628", "\u0646\u0635\u0627\u0628 \u0632\u06A9\u0648\u06C3", "\u0645\u0635\u0627\u0631\u0641 \u0632\u06A9\u0648\u06C3", "\u0642\u06CC\u062F \u0648 \u0627\u0633\u062A\u062B\u0646\u0627\u0621");
    } else {
      if (conditionsToVerify.length > 0) stormPerspectives.push("\u0634\u0631\u0637 \u0635\u062D\u062A", "\u0642\u06CC\u062F");
      if (exceptionsToVerify.length > 0) stormPerspectives.push("\u0631\u062E\u0635\u062A / \u0639\u0630\u0631", "\u0627\u0633\u062A\u062B\u0646\u0627\u0621");
      if (norm.includes("\u0627\u062E\u062A\u0644\u0627\u0641") || norm.includes("\u0645\u0630\u0627\u06C1\u0628")) stormPerspectives.push("\u0627\u062E\u062A\u0644\u0627\u0641 \u0641\u0642\u06C1\u0627\u0621", "\u062F\u0644\u0627\u0626\u0644");
    }
  }
  return {
    questionType,
    mainQuestion: question,
    subQuestions,
    researchTasks,
    keyConcepts,
    requiredEvidenceTypes,
    searchStrategies,
    conditionsToVerify,
    exceptionsToVerify,
    exclusions,
    sourceScope,
    researchDepth,
    complexity,
    stormPerspectives
  };
}

// server/evidenceMapper.ts
function classifyEvidenceRole(text, semanticRole) {
  if (semanticRole) {
    const sr = semanticRole.trim().toLowerCase();
    const validRoles = [
      "rule",
      "condition",
      "qualification",
      "exception",
      "restriction",
      "definition",
      "cause",
      "consequence",
      "alternative",
      "disagreement",
      "supporting_evidence",
      "opposing_evidence",
      "explanation",
      "uncertain"
    ];
    if (validRoles.includes(sr)) {
      return sr;
    }
    if (sr === "supporting evidence") return "supporting_evidence";
    if (sr === "opposing evidence") return "opposing_evidence";
  }
  const norm = normalizeArabicText(text);
  const strongConditionMarkers = ["\u0628\u0634\u0631\u0637", "\u0634\u0631\u064A\u0637\u0647", "\u0634\u0631\u0637"];
  if (strongConditionMarkers.some((m) => norm.includes(m))) {
    return "condition";
  }
  const scholarOpinionMarkers = [
    "\u062E\u0644\u0627\u0641\u0627",
    "\u062E\u0627\u0644\u0641\u0647",
    "\u062E\u0644\u0627\u0641\u0627 \u0644",
    "\u0639\u0646\u062F \u0627\u0628\u064A \u062D\u0646\u064A\u0641\u0629",
    "\u0639\u0646\u062F \u0627\u0644\u0634\u0627\u0641\u0639\u064A",
    "\u0639\u0646\u062F \u0645\u0627\u0644\u0643",
    "\u0648\u0642\u0627\u0644 \u0627\u0644\u0634\u0627\u0641\u0639\u064A",
    "\u0648\u0642\u0627\u0644 \u0645\u0627\u0644\u0643",
    "\u0648\u0642\u0627\u0644 \u0627\u062D\u0645\u062F",
    "\u0648\u0642\u0627\u0644 \u0627\u0628\u0648 \u064A\u0648\u0633\u0641",
    "\u0648\u0642\u0627\u0644 \u0645\u062D\u0645\u062F",
    "\u0639\u0646\u062F \u0627\u0644\u0635\u0627\u062D\u0628\u064A\u0646",
    "\u0639\u0646\u062F \u0627\u0644\u062C\u0645\u0647\u0648\u0631",
    "\u0645\u0630\u0647\u0628 \u0627\u0644\u062C\u0645\u0647\u0648\u0631",
    "\u0645\u0630\u0647\u0628 \u0627\u0644\u0634\u0627\u0641\u0639\u064A\u0629",
    "\u0645\u0630\u0647\u0628 \u0627\u0644\u062D\u0646\u0641\u064A\u0629"
  ];
  if (scholarOpinionMarkers.some((m) => norm.includes(m))) {
    return "disagreement";
  }
  const generalExceptions = ["\u0627\u0644\u0627", "\u063A\u064A\u0631", "\u0645\u0627 \u0639\u062F\u0627", "\u0645\u0633\u062A\u062B\u0646\u0649", "\u0627\u0644\u0627 \u0627\u0646"];
  if (generalExceptions.some((m) => norm.includes(m))) {
    const ambiguousExceptions = ["\u0644\u0643\u0646 \u0642\u0627\u0644", "\u063A\u064A\u0631 \u0627\u0646 \u0627\u0644\u0634\u0627\u0641\u0639\u064A", "\u0627\u0644\u0627 \u0642\u0627\u0644", "\u0639\u0644\u0649 \u0646\u062D\u0648"];
    if (ambiguousExceptions.some((m) => norm.includes(m))) {
      return "uncertain";
    }
    return "exception";
  }
  const generalConditionWords = ["\u0627\u0630\u0627", "\u0627\u0646 \u0643\u0627\u0646", "\u0639\u0646\u062F", "\u0645\u0627 \u0644\u0645", "\u0639\u0644\u0649 \u0627\u0646"];
  if (generalConditionWords.some((m) => norm.includes(m))) {
    const scholarNames = [
      "\u0627\u0628\u064A \u062D\u0646\u064A\u0641\u0629",
      "\u0627\u0628\u0649 \u062D\u0646\u064A\u0641\u0629",
      "\u0627\u0628\u064A \u064A\u0648\u0633\u0641",
      "\u0645\u062D\u0645\u062F",
      "\u0627\u0644\u0634\u0627\u0641\u0639\u064A",
      "\u0645\u0627\u0644\u0643",
      "\u0627\u062D\u0645\u062F",
      "\u0627\u0644\u0639\u0644\u0645\u0627\u0621",
      "\u0627\u0644\u062C\u0645\u0647\u0648\u0631",
      "\u0627\u0635\u062D\u0627\u0628\u0646\u0627",
      "\u0627\u0644\u0635\u062D\u0627\u0628\u0647",
      "\u0627\u0644\u062A\u0627\u0628\u0639\u064A\u0646",
      "\u0627\u0644\u0627\u0626\u0645\u0647",
      "\u0627\u0644\u0641\u0642\u0647\u0627\u0621",
      "\u0627\u0644\u062D\u0646\u0641\u064A\u0629",
      "\u0627\u0644\u0645\u0627\u0644\u0643\u064A\u0629",
      "\u0627\u0644\u0634\u0627\u0641\u0639\u064A\u0629",
      "\u0627\u0644\u062D\u0646\u0627\u0628\u0644\u0629"
    ];
    let hasScholarMatch = false;
    for (const name of scholarNames) {
      if (norm.includes(`\u0639\u0646\u062F ${name}`) || norm.includes(`\u0627\u0630\u0627 \u0642\u0627\u0644 ${name}`) || norm.includes(`\u0639\u0646\u062F \u0642\u0648\u0644 ${name}`)) {
        hasScholarMatch = true;
        break;
      }
    }
    if (hasScholarMatch) {
      return "disagreement";
    }
    if (norm.includes("\u0639\u0644\u0649 \u0647\u0630\u0627") || norm.includes("\u0639\u0644\u0649 \u0627\u0644\u0645\u0630\u0647\u0628") || norm.includes("\u0639\u0644\u0649 \u0627\u0646\u0647") || norm.includes("\u0646\u062D\u0648 \u0630\u0644\u0643")) {
      return "uncertain";
    }
    return "condition";
  }
  const restrictionMarkers = ["\u0644\u0627 \u064A\u062C\u0648\u0632", "\u064A\u0645\u0646\u0639", "\u062D\u0631\u0627\u0645", "\u0645\u0645\u0646\u0648\u0639", "\u0645\u062D\u0638\u0648\u0631", "\u0642\u064A\u062F", "\u0645\u0642\u064A\u062F"];
  if (restrictionMarkers.some((m) => norm.includes(m))) {
    return "restriction";
  }
  const consequenceMarkers = ["\u0641\u062F\u064A\u0647", "\u062A\u062C\u0628", "\u064A\u0644\u0632\u0645\u0647", "\u0639\u0644\u064A\u0647 \u0627\u0644\u062F\u0645", "\u0641\u0639\u0644\u064A\u0647", "\u062C\u0632\u0627\u0621", "\u0648\u062C\u0628 \u0639\u0644\u064A\u0647"];
  if (consequenceMarkers.some((m) => norm.includes(m))) {
    return "consequence";
  }
  const definitionMarkers = ["\u0647\u0648", "\u064A\u0639\u0646\u064A", "\u062D\u062F\u0647", "\u062A\u0639\u0631\u064A\u0641\u0647", "\u0627\u0644\u0645\u0631\u0627\u062F \u0628\u0647"];
  if (definitionMarkers.some((m) => norm.includes(m)) && norm.length < 300) {
    return "definition";
  }
  return "rule";
}
function buildEvidenceMap(passages, userQuestion, intent, plan) {
  const claims = [];
  const relations = [];
  const criticFlags = [];
  const roleGroups = /* @__PURE__ */ new Map();
  for (const p of passages) {
    const role = classifyEvidenceRole(p.arabic_text, p.semantic_role || p.evidence_label_urdu);
    p.evidence_level = ["exception", "EXCEPTION", "condition", "CONDITION"].includes(role) ? "DIRECT" : p.evidence_level;
    if (!roleGroups.has(role)) {
      roleGroups.set(role, []);
    }
    roleGroups.get(role).push(p);
  }
  roleGroups.forEach((citations, role) => {
    let label = "\u062A\u0641\u0635\u06CC\u0644";
    const r = String(role).toLowerCase();
    if (r === "rule" || role === "DIRECT_RULING") label = "\u0628\u0646\u06CC\u0627\u062F\u06CC \u0634\u0631\u0639\u06CC \u062D\u06A9\u0645 (Rule)";
    else if (r === "condition" || role === "CONDITION") label = "\u0634\u0631\u0637 \u0648 \u062D\u062F\u0648\u062F (Condition)";
    else if (r === "qualification" || role === "QUALIFICATION") label = "\u062A\u0648\u062C\u06CC\u06C1 / \u062A\u062E\u0635\u06CC\u0635 (Qualification)";
    else if (r === "exception" || role === "EXCEPTION") label = "\u0627\u0633\u062A\u062B\u0646\u0627\u0626\u06CC \u0635\u0648\u0631\u062A \u062D\u0627\u0644 (Exception)";
    else if (r === "restriction") label = "\u0642\u06CC\u062F / \u0645\u0645\u0627\u0646\u0639\u062A (Restriction)";
    else if (r === "definition" || role === "DEFINITION") label = "\u0627\u0635\u0637\u0644\u0627\u062D\u06CC \u062A\u0639\u0631\u06CC\u0641 (Definition)";
    else if (r === "cause" || role === "CAUSE") label = "\u0639\u0644\u062A / \u0633\u0628\u0628 (Cause)";
    else if (r === "consequence" || role === "CONSEQUENCE") label = "\u0644\u0627\u0632\u0645\u06C1 / \u0641\u062F\u06CC\u06C1 / \u062C\u0632\u0627\u0621 (Consequence)";
    else if (r === "alternative") label = "\u0645\u062A\u0628\u0627\u062F\u0644 \u0639\u0645\u0644 (Alternative)";
    else if (r === "disagreement") label = "\u0627\u062E\u062A\u0644\u0627\u0641\u06CC \u0645\u0648\u0642\u0641 (Disagreement)";
    else if (r === "supporting_evidence" || role === "SUPPORTING") label = "\u0645\u0624\u06CC\u062F \u0634\u0648\u0627\u06C1\u062F (Supporting)";
    else if (r === "opposing_evidence") label = "\u0645\u062E\u0627\u0644\u0641 \u062F\u0644\u06CC\u0644 (Opposing)";
    claims.push({
      claimText: label,
      evidenceRole: role,
      citations
    });
  });
  for (let i = 0; i < passages.length; i++) {
    const p1 = passages[i];
    const key1 = `${p1.book_id}_${p1.internalPage}`;
    const r1 = classifyEvidenceRole(p1.arabic_text, p1.semantic_role || p1.evidence_label_urdu);
    for (let j = i + 1; j < passages.length; j++) {
      const p2 = passages[j];
      const key2 = `${p2.book_id}_${p2.internalPage}`;
      const r2 = classifyEvidenceRole(p2.arabic_text, p2.semantic_role || p2.evidence_label_urdu);
      const r1Lower = String(r1).toLowerCase();
      const r2Lower = String(r2).toLowerCase();
      if ((r1Lower === "rule" || r1 === "DIRECT_RULING") && (r2Lower === "condition" || r2 === "CONDITION")) {
        relations.push({
          sourceId: key2,
          targetId: key1,
          relation: "QUALIFIES",
          description: `Book "${p2.book}" conditions/restricts the broader ruling in "${p1.book}"`
        });
      } else if ((r1Lower === "rule" || r1 === "DIRECT_RULING") && (r2Lower === "exception" || r2 === "EXCEPTION")) {
        relations.push({
          sourceId: key2,
          targetId: key1,
          relation: "EXCEPTS",
          description: `Book "${p2.book}" outlines an exception to the general ruling in "${p1.book}"`
        });
      } else if ((r1Lower === "rule" || r1 === "DIRECT_RULING") && (r2Lower === "consequence" || r2 === "CONSEQUENCE")) {
        relations.push({
          sourceId: key2,
          targetId: key1,
          relation: "LIMITS",
          description: `Book "${p2.book}" defines liability/consequences for the ruling in "${p1.book}"`
        });
      } else if (p1.book === p2.book) {
        relations.push({
          sourceId: key2,
          targetId: key1,
          relation: "EXPLAINS",
          description: `Different pages/sections within same work "${p1.book}" supplement each other`
        });
      }
    }
  }
  const normQ = normalizeArabicText(userQuestion);
  const subquestions = intent?.subQuestions || plan?.subQuestions || [userQuestion];
  const hasRule = roleGroups.has("rule") || roleGroups.has("DIRECT_RULING");
  if (!hasRule && passages.length === 0) {
    criticFlags.push("UNSUPPORTED_CLAIM: No direct (\u0635\u0631\u064A\u062D) textual evidence retrieved to prove primary legal claim.");
  }
  const conditionsToVerify = plan?.conditionsToVerify || intent?.researchPlan?.required_conditions || [];
  const hasConditionWord = normQ.includes("\u0627\u06AF\u0631") || normQ.includes("\u0634\u0631\u0637") || normQ.includes("\u0628\u0634\u0631\u0637");
  const conditionFound = roleGroups.has("condition") || roleGroups.has("CONDITION");
  if ((conditionsToVerify.length > 0 || hasConditionWord) && !conditionFound) {
    criticFlags.push("MISSING_CONDITION: Question involves conditions or conditional circumstances, but no conditional passage (condition/CONDITION) is classified.");
  }
  const exceptionsToVerify = plan?.exceptionsToVerify || intent?.researchPlan?.required_exceptions || [];
  const hasExceptionWord = normQ.includes("\u0639\u0630\u0631") || normQ.includes("\u0636\u0631\u0648\u0631\u062A") || normQ.includes("\u0645\u062C\u0628\u0648\u0631\u06CC") || normQ.includes("\u0627\u0633\u062A\u062B\u0646\u0627");
  const exceptionFound = roleGroups.has("exception") || roleGroups.has("EXCEPTION");
  if ((exceptionsToVerify.length > 0 || hasExceptionWord) && !exceptionFound) {
    criticFlags.push("MISSING_EXCEPTION: Question involves excuses/necessity, but no exception passage (exception/EXCEPTION) is classified.");
  }
  if (subquestions.length > 1 && passages.length < subquestions.length) {
    criticFlags.push(`INSUFFICIENT_COVERAGE: Question has ${subquestions.length} distinct sub-questions, but only ${passages.length} source passages are available.`);
  }
  for (const p of passages) {
    if (!p.book || !p.arabic_text) {
      criticFlags.push(`CITATION_MISMATCH: Invalid citation object retrieved without book title or Arabic verbatim.`);
    }
  }
  return {
    claims,
    relations,
    criticFlags
  };
}

// server/searchService.ts
import { GoogleGenAI as GoogleGenAI5, Type as Type3 } from "@google/genai";

// server/conversationManager.ts
import { GoogleGenAI as GoogleGenAI4, Type as Type2 } from "@google/genai";
var sessionStore = /* @__PURE__ */ new Map();
function getOrCreateSession(conversationId) {
  if (!sessionStore.has(conversationId)) {
    sessionStore.set(conversationId, {
      id: conversationId,
      messages: [],
      categoryIds: [],
      bookIds: []
    });
  }
  return sessionStore.get(conversationId);
}
async function resolveConversationalQuery(conversationId, history, userMessage, overrideKey) {
  const session = getOrCreateSession(conversationId);
  if (history && history.length > 0) {
    session.messages = history;
  }
  if (session.messages.length === 0) {
    return {
      resolvedQuestion: userMessage,
      isFollowUp: false,
      isUnrelated: true,
      categoryIds: session.categoryIds,
      bookIds: session.bookIds
    };
  }
  const apiKey = overrideKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      resolvedQuestion: userMessage,
      isFollowUp: false,
      isUnrelated: true
    };
  }
  const ai = new GoogleGenAI4({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  const candidateModels = [
    process.env.AI_MODEL,
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
    "gemini-flash-latest"
  ].filter(Boolean);
  const compactHistory = session.messages.slice(-15).map((m) => ({
    role: m.role,
    text: m.text.substring(0, 6e3)
  }));
  const systemInstruction = `You are an expert Fiqh research context analyzer.
Analyze the user's latest query in the context of the recent chat history.
Your job is to:
1. Determine if the query is a FOLLOW-UP question to the previous discussion/topic, or a completely NEW, UNRELATED research question.
2. If it is a FOLLOW-UP, identify all pronouns (e.g. "\u0627\u0633", "\u0627\u0633 \u06A9\u06CC", "\u0627\u0633 \u0645\u06CC\u06BA", "\u0645\u0630\u06A9\u0648\u0631\u06C1", "\u0645\u0630\u06A9\u0648\u0631\u06C1 \u0628\u0627\u0644\u0627", "\u0627\u0646", "\u06CC\u06C1", "\u0648\u06C1") or context clues (e.g. "\u067E\u06C1\u0644\u06CC \u0634\u0631\u0637", "\u067E\u0627\u0646\u0686 \u0634\u0631\u0627\u0626\u0637", "\u0628\u0627\u0642\u06CC \u0634\u0631\u0627\u0626\u0637", "\u0645\u0632\u06CC\u062F \u062C\u0632\u0626\u06CC\u0627\u062A", "\u0627\u0648\u067E\u0631 \u0648\u0627\u0644\u0627 \u0645\u0633\u0626\u0644\u06C1", "\u0627\u0633\u06CC \u0645\u0633\u0626\u0644\u06D2", "\u062A\u0641\u0635\u06CC\u0644", "\u0639\u0631\u0628\u06CC \u0639\u0628\u0627\u0631\u062A", "\u062A\u0631\u062C\u0645\u06C1") and resolve them to the previous topics/answers.
3. Formulate a highly independent, standalone Fiqh research question in Urdu/Arabic that fully merges the original subject and context with the new user instruction (e.g., if previous answer discussed 5 conditions of "\u0628\u06CC\u0639 \u0627\u0644\u0648\u0641\u0627" and user asks "\u0627\u0646 \u067E\u0627\u0646\u0686 \u0634\u0631\u0627\u0626\u0637 \u06A9\u06D2 \u0639\u0644\u0627\u0648\u06C1 \u062C\u0648 \u0634\u0631\u0627\u0626\u0637 \u06C1\u06CC\u06BA \u0627\u0646 \u06A9\u06CC \u062C\u0632\u0626\u06CC\u0627\u062A \u0628\u06BE\u06CC \u0628\u06CC\u0627\u0646 \u06A9\u0631\u06CC\u06BA", resolve it to a query seeking additional conditions or details of \u0628\u06CC\u0639 \u0627\u0644\u0648\u0641\u0627 beyond those specific five).
4. If it is an entirely unrelated question (e.g., changing topics completely), classify isUnrelated as true and resolvedQuestion as the user's raw message.
5. Check if the user is asking to restrict or modify the target sources, books, or schools of thought (e.g., "\u0627\u0628 \u0635\u0631\u0641 \u0627\u0644\u06C1\u062F\u0627\u06CC\u06C1 \u062F\u06CC\u06A9\u06BE\u06CC\u06BA", "\u0635\u0631\u0641 \u062D\u0646\u0641\u06CC \u06A9\u062A\u0628 \u0645\u06CC\u06BA \u062A\u0644\u0627\u0634 \u06A9\u0631\u06CC\u06BA"). If so, identify the requested scope.

Return a JSON object conforming exactly to the specified response schema.`;
  const prompt = `Chat History:
${JSON.stringify(compactHistory, null, 2)}

User Latest Query: "${userMessage}"`;
  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type2.OBJECT,
            properties: {
              isFollowUp: { type: Type2.BOOLEAN, description: "Is this query a direct follow-up or refinement of the previous topic?" },
              isUnrelated: { type: Type2.BOOLEAN, description: "Is this a completely new unrelated topic?" },
              resolvedQuestion: { type: Type2.STRING, description: "The independent, standalone Fiqh research question resolving all context clues." },
              requestedScopeUpdate: {
                type: Type2.OBJECT,
                properties: {
                  madhhabFilter: { type: Type2.STRING, description: 'e.g. "hanafi", "shafi", "all" if requested' },
                  specificBookName: { type: Type2.STRING, description: "Specific book name mentioned, if any" },
                  allHanafiRequested: { type: Type2.BOOLEAN, description: "Set to true if user asked for all Hanafi books" }
                }
              }
            },
            required: ["isFollowUp", "isUnrelated", "resolvedQuestion"]
          }
        }
      });
      if (response && response.text) {
        const result = JSON.parse(response.text);
        if (result.requestedScopeUpdate) {
          const update = result.requestedScopeUpdate;
          if (update.allHanafiRequested || update.madhhabFilter === "hanafi") {
            session.categoryIds = ["14"];
            session.bookIds = [];
          } else if (update.madhhabFilter === "all") {
            session.categoryIds = [];
            session.bookIds = [];
          }
          if (update.specificBookName) {
            console.log(`[ConversationManager] User requested specific book limit: "${update.specificBookName}"`);
          }
        }
        return {
          resolvedQuestion: result.resolvedQuestion || userMessage,
          isFollowUp: result.isFollowUp,
          categoryIds: session.categoryIds,
          bookIds: session.bookIds,
          isUnrelated: result.isUnrelated
        };
      }
    } catch (err) {
      console.warn(`[ConversationManager] Error resolving query using ${modelName}:`, err?.message || err);
    }
  }
  return {
    resolvedQuestion: userMessage,
    isFollowUp: false,
    isUnrelated: true
  };
}

// server/searchService.ts
async function executeResearchPipeline(userQuestion, filter = "all", options) {
  let activeQuestion = userQuestion.trim();
  let isFollowUp = false;
  let activeCategoryIds = options?.categoryIds || [];
  let activeBookIds = options?.bookIds || [];
  if (options?.categoryId && !activeCategoryIds.includes(options.categoryId)) {
    activeCategoryIds = [options.categoryId, ...activeCategoryIds];
  }
  if (options?.conversationId) {
    try {
      const resolved = await resolveConversationalQuery(
        options.conversationId,
        options.history || [],
        userQuestion,
        options.apiKey
      );
      activeQuestion = resolved.resolvedQuestion.trim();
      isFollowUp = resolved.isFollowUp;
      if (resolved.categoryIds && resolved.categoryIds.length > 0) {
        activeCategoryIds = resolved.categoryIds;
      }
      if (resolved.bookIds && resolved.bookIds.length > 0) {
        activeBookIds = resolved.bookIds;
      }
      console.log(`[Conversational Resolver] Resolved: "${activeQuestion}", Follow-up: ${isFollowUp}, Active Cats: ${activeCategoryIds}, Active Books: ${activeBookIds}`);
    } catch (err) {
      console.warn("[Conversational Resolver] Error resolving query:", err?.message || err);
    }
  }
  const trimmedQuestion = activeQuestion;
  const manualMode = options?.manualMode || "auto";
  const plan = createResearchPlan(trimmedQuestion, filter, {
    categoryId: options?.categoryId,
    bookIds: activeBookIds,
    authorId: options?.authorId
  });
  const {
    selectedMode,
    detectedMode,
    intent,
    generatedQueries,
    rejectedQueries,
    modelsAttempted: queryModels
  } = await analyzeAndGenerateQueries(trimmedQuestion, filter, manualMode, options?.apiKey);
  intent.structuredAnalysis = intent.structuredAnalysis || {
    topic: plan.keyConcepts[0] || "\u0639\u0627\u0645",
    subject: plan.keyConcepts[0] || "\u0645\u0633\u0623\u0644\u0629 \u0634\u0631\u0639\u064A\u0629",
    action: trimmedQuestion,
    person: "\u0645\u06A9\u0644\u0641",
    condition: plan.conditionsToVerify.join("\u060C ") || "\u06A9\u0648\u0626\u06CC \u0634\u0631\u0637 \u0646\u06C1\u06CC\u06BA",
    circumstance: plan.exceptionsToVerify.join("\u060C ") || "\u06A9\u0648\u0626\u06CC \u0639\u0630\u0631 \u0646\u06C1\u06CC\u06BA",
    requested_ruling: "\u062D\u06A9\u0645 \u0634\u0631\u0639\u06CC",
    requested_information: "\u0639\u0628\u0627\u0631\u062A \u0627\u0648\u0631 \u062A\u0631\u062C\u0645\u06C1",
    madhhab: filter === "hanafi" ? "\u0627\u0644\u062D\u0646\u0641\u064A" : "\u0639\u0627\u0645",
    category: filter,
    selected_books: activeBookIds,
    selected_authors: options?.authorId ? [options.authorId] : [],
    search_intent: "fiqh_ruling_search",
    exclusions: [],
    key_concepts: plan.keyConcepts,
    Arabic_terms: intent.keywords || [],
    synonyms: []
  };
  const complexity = plan.complexity;
  const researchLevel = intent.researchPlan?.research_level ?? (plan.researchDepth === "level3" ? 3 : plan.researchDepth === "level2" ? 2 : 1);
  console.log(`[SearchService] Orchestrator routed question. Complexity: ${complexity}, Level: ${researchLevel}`);
  let adaptiveQueries = [];
  const isSimilarPhraseRequest = selectedMode === "similar" || detectedMode === "similar" || trimmedQuestion.includes("\u0645\u0644\u062A\u06CC \u062C\u0644\u062A\u06CC \u0639\u0628\u0627\u0631\u062A");
  const matchedQuoteMatch = trimmedQuestion.match(/"([^"]+)"|'([^']+)'|«([^»]+)»/);
  const matchedQuoteText = matchedQuoteMatch ? matchedQuoteMatch[1] || matchedQuoteMatch[2] || matchedQuoteMatch[3] : "";
  const multiStrategyQueries = intent.multiStrategyQueries || {
    exact: [],
    terminology: [],
    classicalArabic: [],
    synonyms: [],
    conceptual: [],
    reformulated: [],
    opposing: []
  };
  if (isSimilarPhraseRequest && matchedQuoteText) {
    adaptiveQueries = [
      normalizeArabicText(matchedQuoteText),
      ...multiStrategyQueries.exact || [],
      ...multiStrategyQueries.terminology || [],
      ...multiStrategyQueries.synonyms || []
    ];
  } else if (complexity === "SIMPLE") {
    adaptiveQueries = [
      ...multiStrategyQueries.exact || [],
      ...multiStrategyQueries.terminology || [],
      ...multiStrategyQueries.classicalArabic || []
    ];
    if (adaptiveQueries.length === 0) {
      adaptiveQueries = [trimmedQuestion];
    }
    adaptiveQueries = adaptiveQueries.slice(0, 2);
  } else if (complexity === "MODERATE") {
    adaptiveQueries = [
      ...multiStrategyQueries.exact || [],
      ...multiStrategyQueries.terminology || [],
      ...multiStrategyQueries.synonyms || []
    ];
    if (adaptiveQueries.length === 0) {
      adaptiveQueries = [trimmedQuestion];
    }
    adaptiveQueries = adaptiveQueries.slice(0, 4);
  } else {
    adaptiveQueries = [
      ...multiStrategyQueries.exact || [],
      ...multiStrategyQueries.terminology || [],
      ...multiStrategyQueries.classicalArabic || [],
      ...multiStrategyQueries.conceptual || [],
      ...multiStrategyQueries.reformulated || []
    ];
    if (adaptiveQueries.length === 0) {
      adaptiveQueries = [trimmedQuestion];
    }
    adaptiveQueries = adaptiveQueries.slice(0, 6);
  }
  let currentQueries = Array.from(new Set(adaptiveQueries)).map(normalizeArabicText).filter((q) => q.length > 2);
  if (currentQueries.length === 0) {
    currentQueries = [normalizeArabicText(trimmedQuestion)];
  }
  let retrievalResult;
  console.log(`[SearchService] Executing Ultra-Fast Adaptive Multi-Strategy Retrieval`);
  retrievalResult = await retrieveNususPassages(currentQueries, trimmedQuestion, filter, {
    categoryId: options?.categoryId,
    categoryIds: activeCategoryIds,
    bookIds: activeBookIds,
    authorId: options?.authorId,
    researchMode: selectedMode,
    isOpposingRequested: intent.isOpposingRequested,
    intentObj: intent
  });
  let evidenceMap = buildEvidenceMap(retrievalResult.passages, trimmedQuestion, intent, plan);
  const maxRounds = retrievalResult.passages.length >= 4 ? 1 : complexity === "SIMPLE" ? 1 : 2;
  let currentRound = 1;
  while (currentRound < maxRounds) {
    if (retrievalResult.passages.length >= 4 || evidenceMap.criticFlags.length === 0) {
      console.log(`[SearchService] Stopping early at round ${currentRound} because sufficient evidence (${retrievalResult.passages.length} passages) retrieved.`);
      break;
    }
    console.log(`[SearchService] Critic flagged issues on round ${currentRound}:`, evidenceMap.criticFlags);
    const subquestions = plan.subQuestions || [];
    const isConditionMissing = evidenceMap.criticFlags.some((f) => f.includes("MISSING_CONDITION"));
    const isExceptionMissing = evidenceMap.criticFlags.some((f) => f.includes("MISSING_EXCEPTION"));
    const isInsufficientCoverage = evidenceMap.criticFlags.some((f) => f.includes("INSUFFICIENT_COVERAGE"));
    const secondaryQueryPool = [];
    const mainSubjectArabic = normalizeArabicText(intent.mainSubject || "");
    if (isConditionMissing) {
      secondaryQueryPool.push(
        `${mainSubjectArabic} \u0628\u0634\u0631\u0637`,
        `${mainSubjectArabic} \u0634\u0631\u0648\u0637`,
        ...(multiStrategyQueries.classicalArabic || []).slice(0, 2).map((q) => `${q} \u0628\u0634\u0631\u0637`),
        ...(multiStrategyQueries.conceptual || []).slice(0, 2).map((q) => `${q} \u0634\u0631\u0648\u0637`)
      );
    }
    if (isExceptionMissing) {
      secondaryQueryPool.push(
        `${mainSubjectArabic} \u0627\u0644\u0627`,
        `${mainSubjectArabic} \u0636\u0631\u0648\u0631\u0629`,
        `${mainSubjectArabic} \u0639\u0630\u0631`,
        ...(multiStrategyQueries.classicalArabic || []).slice(0, 2).map((q) => `${q} \u0627\u0644\u0627`),
        ...(multiStrategyQueries.conceptual || []).slice(0, 2).map((q) => `${q} \u0636\u0631\u0648\u0631\u0629`)
      );
    }
    if (isInsufficientCoverage && subquestions.length > 1) {
      for (const sub of subquestions) {
        const normSub = normalizeArabicText(sub);
        const isCovered = retrievalResult.passages.some((p) => {
          const normP = normalizeArabicText(p.arabic_text);
          return normP.includes(normSub.substring(0, 30));
        });
        if (!isCovered) {
          console.log(`[SearchService] Targeting missing subquestion coverage: "${sub}"`);
          secondaryQueryPool.push(
            normalizeArabicText(sub),
            ...sub.split(" ").filter((w) => w.length > 3).slice(0, 3)
          );
        }
      }
    }
    secondaryQueryPool.push(
      ...multiStrategyQueries.conceptual || [],
      ...multiStrategyQueries.reformulated || [],
      ...multiStrategyQueries.synonyms || [],
      mainSubjectArabic
    );
    const nextQueries = Array.from(new Set(secondaryQueryPool)).map(normalizeArabicText).filter((q) => q.length > 2 && !currentQueries.includes(q)).slice(0, 3);
    if (nextQueries.length === 0) {
      console.log(`[SearchService] No more unique adaptive queries available.`);
      break;
    }
    console.log(`[SearchService] Executing adaptive Round ${currentRound + 1} with targeted queries:`, nextQueries);
    currentQueries.push(...nextQueries);
    const roundResult = await retrieveNususPassages(nextQueries, trimmedQuestion, filter, {
      categoryId: options?.categoryId,
      categoryIds: activeCategoryIds,
      bookIds: activeBookIds,
      authorId: options?.authorId,
      researchMode: selectedMode,
      isOpposingRequested: intent.isOpposingRequested,
      intentObj: intent
    });
    const passageMap = /* @__PURE__ */ new Map();
    for (const p of retrievalResult.passages) {
      passageMap.set(`${p.book_id}_${p.internalPage}`, p);
    }
    for (const p of roundResult.passages) {
      const key = `${p.book_id}_${p.internalPage}`;
      if (!passageMap.has(key)) {
        passageMap.set(key, p);
      }
    }
    const mergedPassages = Array.from(passageMap.values()).sort(
      (a, b) => (b.score || 0) - (a.score || 0)
    );
    retrievalResult = {
      passages: mergedPassages.slice(0, 6),
      queriesUsed: Array.from(/* @__PURE__ */ new Set([...retrievalResult.queriesUsed, ...roundResult.queriesUsed])),
      rawHitsCount: retrievalResult.rawHitsCount + roundResult.rawHitsCount,
      rejectedSources: [...retrievalResult.rejectedSources, ...roundResult.rejectedSources],
      evidenceCounts: { ...retrievalResult.evidenceCounts }
    };
    evidenceMap = buildEvidenceMap(retrievalResult.passages, trimmedQuestion, intent, plan);
    currentRound++;
  }
  if (isSimilarPhraseRequest && matchedQuoteText) {
    const cleanQuote = normalizeArabicText(matchedQuoteText);
    retrievalResult.passages.forEach((p) => {
      const normText = normalizeArabicText(p.arabic_text);
      if (normText.includes(cleanQuote)) {
        p.score = (p.score || 0) + 50;
      } else {
        const tokens = cleanQuote.split(" ").filter((t) => t.length > 2);
        const overlap = tokens.filter((t) => normText.includes(t)).length;
        p.score = (p.score || 0) + overlap * 5;
      }
    });
    retrievalResult.passages.sort((a, b) => (b.score || 0) - (a.score || 0));
  }
  const { answer, modelsAttempted: answerModels } = await synthesizeUrduResearchAnswer(
    trimmedQuestion,
    retrievalResult.passages,
    {
      researchMode: selectedMode,
      isOpposingRequested: intent.isOpposingRequested,
      isComparative: intent.isComparative
    },
    options?.apiKey
  );
  const debugInfo = {
    originalQuestion: trimmedQuestion,
    selectedMode,
    detectedMode,
    detectedIntent: {
      keywords: intent.keywords,
      language: intent.language,
      targetFilter: intent.targetFilter,
      domain: intent.domain,
      mainSubject: intent.mainSubject,
      claim: intent.claim,
      isOpposingRequested: intent.isOpposingRequested
    },
    generatedQueries: currentQueries,
    rejectedQueries,
    queriesUsed: retrievalResult.queriesUsed,
    rawHitsCount: retrievalResult.rawHitsCount,
    scoredPassagesCount: retrievalResult.passages.length,
    evidenceCounts: retrievalResult.evidenceCounts,
    selectedPassages: retrievalResult.passages.map((p) => ({
      book: p.book,
      score: p.score || 0,
      similarityScore: p.similarity_score,
      evidenceLevel: p.evidence_level,
      evidenceLabelUrdu: p.evidence_label_urdu,
      locator: p.locator,
      url: p.url
    })),
    rejectedSources: retrievalResult.rejectedSources,
    modelsAttempted: Array.from(/* @__PURE__ */ new Set([...queryModels, ...answerModels]))
  };
  return {
    question: trimmedQuestion,
    answer,
    sources: retrievalResult.passages,
    queriesUsed: retrievalResult.queriesUsed,
    debugInfo
  };
}

// server/createApp.ts
dotenv.config();
var turathClient = null;
async function getTurathClient2() {
  if (!turathClient) {
    const nususTurath = await import("nusus/turath");
    turathClient = nususTurath.createTurathClient({ timeout: 15e3 });
  }
  return turathClient;
}
async function createApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "\u062A\u0631\u0627\u062B \u0627\u06D2 \u0622\u0626\u06CC (Turath AI)",
      author: "\u0645\u0641\u062A\u06CC \u0645\u062D\u0645\u062F \u0627\u0648\u06CC\u0633 \u0628\u0627\u062C\u0648\u06C1 (Mufti Muhammad Awais Bajwa)",
      time: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/config/auth-status", async (req, res) => {
    try {
      const { getAuthStatus: getAuthStatus2 } = await Promise.resolve().then(() => (init_apiKeyManager(), apiKeyManager_exports));
      const status = getAuthStatus2(req);
      res.json(status);
    } catch (err) {
      res.json({
        isDevMode: false,
        hasServerKey: false,
        requiresUserKey: true,
        environmentName: "Public / Bring-Your-Own-Key"
      });
    }
  });
  app.post("/api/config/validate-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      const { validateGeminiKey: validateGeminiKey2 } = await Promise.resolve().then(() => (init_apiKeyManager(), apiKeyManager_exports));
      const result = await validateGeminiKey2(apiKey);
      res.json(result);
    } catch (err) {
      res.json({ valid: false, error: err.message || "Key validation failed" });
    }
  });
  app.get("/api/catalog/categories", async (_req, res) => {
    try {
      const turath = await getTurathClient2();
      const categories = await turath.listCategories();
      res.json({ categories });
    } catch (err) {
      console.error("Error fetching categories:", err);
      res.status(500).json({ error: err?.message || "Failed to fetch catalog categories" });
    }
  });
  app.get("/api/catalog/books", async (req, res) => {
    try {
      const turath = await getTurathClient2();
      const categoryId = req.query.categoryId ? String(req.query.categoryId) : void 0;
      const categoryIdsStr = req.query.categoryIds ? String(req.query.categoryIds) : void 0;
      const query = req.query.query ? String(req.query.query) : "";
      const options = { limit: 8e3 };
      if (categoryIdsStr) {
        options.categoryIds = categoryIdsStr.split(",").filter(Boolean);
      } else if (categoryId) {
        options.categoryIds = [categoryId];
      }
      const books = await turath.findBooks(query, options);
      res.json({ books });
    } catch (err) {
      console.error("Error fetching books:", err);
      res.status(500).json({ error: err?.message || "Failed to fetch catalog books" });
    }
  });
  app.get("/api/catalog/authors", async (req, res) => {
    try {
      const turath = await getTurathClient2();
      const query = req.query.query ? String(req.query.query) : "";
      const authors = await turath.findAuthors(query, { limit: 100 });
      res.json({ authors });
    } catch (err) {
      console.error("Error fetching authors:", err);
      res.status(500).json({ error: err?.message || "Failed to fetch catalog authors" });
    }
  });
  app.get("/api/book/page", async (req, res) => {
    try {
      const bookId = req.query.bookId ? String(req.query.bookId) : "";
      const pageNumber = req.query.page ? Number(req.query.page) : 1;
      if (!bookId) {
        return res.status(400).json({ error: "Book ID is required" });
      }
      const { turathProvider: turathProvider2 } = await Promise.resolve().then(() => (init_turathProvider(), turathProvider_exports));
      const pageData = await turathProvider2.getPage(bookId, pageNumber);
      res.json({ page: pageData });
    } catch (err) {
      console.error("Error fetching page:", err);
      res.status(500).json({ error: err?.message || "Failed to fetch book page" });
    }
  });
  app.get("/api/book/info", async (req, res) => {
    try {
      const bookId = req.query.bookId ? String(req.query.bookId) : "";
      if (!bookId) {
        return res.status(400).json({ error: "Book ID is required" });
      }
      const { turathProvider: turathProvider2 } = await Promise.resolve().then(() => (init_turathProvider(), turathProvider_exports));
      const bookInfo = await turathProvider2.getBookInfo(bookId);
      res.json({ book: bookInfo });
    } catch (err) {
      console.error("Error fetching book info:", err);
      res.status(500).json({ error: err?.message || "Failed to fetch book info" });
    }
  });
  app.get("/api/search/literal", async (req, res) => {
    try {
      const query = req.query.query ? String(req.query.query) : "";
      const bookIdsStr = req.query.bookIds ? String(req.query.bookIds) : "";
      const categoryIdsStr = req.query.categoryIds ? String(req.query.categoryIds) : "";
      if (!query.trim()) {
        return res.json({ results: [] });
      }
      const { turathProvider: turathProvider2 } = await Promise.resolve().then(() => (init_turathProvider(), turathProvider_exports));
      const options = {
        maxPassages: 25,
        maxCharsPerPassage: 1500
      };
      const scope = {};
      if (bookIdsStr) {
        scope.bookIds = bookIdsStr.split(",").map(Number).filter(Boolean);
      }
      if (categoryIdsStr) {
        scope.categoryIds = categoryIdsStr.split(",").map(Number).filter(Boolean);
      }
      if (Object.keys(scope).length > 0) {
        options.scope = scope;
      }
      const fetchPassages = async (singleOptions) => {
        try {
          const retrieveRes = await turathProvider2.retrieve(query.trim(), singleOptions);
          if (retrieveRes?.passages && retrieveRes.passages.length > 0) {
            return retrieveRes.passages;
          }
        } catch (err) {
        }
        return [];
      };
      let passages = await fetchPassages(options);
      if (passages.length === 0 && (options.scope?.bookIds || options.scope?.categoryIds)) {
        passages = await fetchPassages({
          maxPassages: 25,
          maxCharsPerPassage: 1500
        });
      }
      const results = passages.map((p) => ({
        bookId: p.book?.id,
        bookTitle: p.book?.title || "\u0643\u062A\u0627\u0628 \u063A\u064A\u0631 \u0645\u0633\u0645\u0649",
        authorName: p.author?.name || "\u0645\u0635\u0646\u0641 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
        pageNumber: p.location?.printedPage || p.location?.internalPage || 1,
        internalPage: p.location?.internalPage || 1,
        printedPage: p.location?.printedPage,
        volume: p.location?.volume,
        snippet: p.text || "",
        headings: p.headings || [],
        url: p.url || `https://app.turath.io/book/${p.book?.id}?page=${p.location?.internalPage || 1}`
      }));
      res.json({ results });
    } catch (err) {
      console.error("Error in literal search:", err);
      res.status(500).json({ error: err?.message || "Failed to search corpus" });
    }
  });
  app.post("/api/translate", async (req, res) => {
    try {
      const { text, style = "balanced" } = req.body;
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "Text is required for translation" });
      }
      const { resolveApiKey: resolveApiKey2 } = await Promise.resolve().then(() => (init_apiKeyManager(), apiKeyManager_exports));
      const userKeyHeader = req.headers["x-gemini-api-key"];
      const apiKey = resolveApiKey2(userKeyHeader || req.body.apiKey, req);
      if (!apiKey) {
        return res.status(400).json({
          error: "Gemini API Key \u062F\u0631\u06A9\u0627\u0631 \u06C1\u06D2\u06D4 \u0628\u0631\u0627\u0626\u06D2 \u0645\u06C1\u0631\u0628\u0627\u0646\u06CC \u0627\u067E\u0646\u06CC Gemini API Key \u062F\u0631\u062C \u06A9\u0631\u06CC\u06BA\u06D4",
          requiresApiKey: true
        });
      }
      const { GoogleGenAI: GoogleGenAI7 } = await import("@google/genai");
      const ai = new GoogleGenAI7({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const candidateModels = Array.from(
        new Set(
          [
            process.env.AI_MODEL,
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-3.7-flash",
            "gemini-3.1-flash-lite",
            "gemini-flash-latest"
          ].filter(Boolean).map((m) => m.startsWith("models/") ? m.substring(7) : m)
        )
      );
      let stylePrompt = "";
      if (style === "literal") {
        stylePrompt = "Provide a word-for-word, highly literal Arabic to Urdu translation (\u0644\u0641\u0638\u06CC \u062A\u0631\u062C\u0645\u06C1) preserving syntactic structures exactly.";
      } else if (style === "idiomatic") {
        stylePrompt = "Provide a beautiful, highly idiomatic and literary Urdu translation (\u0628\u0627\u0645\u062D\u0627\u0648\u0631\u06C1 \u0627\u0648\u0631 \u0627\u062F\u0628\u06CC \u062A\u0631\u062C\u0645\u06C1) that sounds elegant and fluent to native Urdu scholars.";
      } else {
        stylePrompt = "Provide a balanced translation (\u0628\u0627\u0645\u062D\u0627\u0648\u0631\u06C1 \u0627\u0648\u0631 \u0639\u0644\u0645\u06CC \u062A\u0631\u062C\u0645\u06C1) that maintains exact technical juristic definitions and terms (\u0641\u0642\u06C1\u06CC \u0627\u0635\u0637\u0644\u0627\u062D\u0627\u062A) while ensuring clear, accessible scholarly Urdu grammar.";
      }
      const systemInstruction = `You are an expert Islamic Jurisprudence translator specializing in Classical Arabic to Urdu scholarly translation.
Your task is to translate the user's classical Arabic text into beautiful, accurate Urdu.
Guidelines:
1. ${stylePrompt}
2. Maintain the sanctity and accurate Islamic terminology (e.g. do not mistranslate words like "\u0635\u0627\u0639", "\u0645\u062F", "\u062F\u0645", "\u0637\u06CC\u0628", "\u062D\u062F\u062B", "\u062C\u0646\u0627\u0628\u062A"). Keep these terms intact with brief parenthetical Urdu explanations if needed.
3. Keep the translation pure and academic. Do not add conversational fillers, greetings, or meta-commentary (like "Here is your translation:").
4. Output ONLY the translated Urdu text.`;
      let translatedText = "";
      let lastError = null;
      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: text.trim(),
            config: {
              systemInstruction,
              temperature: 0.2
            }
          });
          if (response?.text) {
            translatedText = response.text.trim();
            break;
          }
        } catch (err) {
          lastError = err;
          console.warn(`[Translator] Model ${model} failed, attempting next:`, err?.message || err);
        }
      }
      if (!translatedText && lastError) {
        throw lastError;
      }
      res.json({ translation: translatedText });
    } catch (err) {
      console.error("Error in translator:", err);
      res.status(500).json({ error: err?.message || "Failed to translate text" });
    }
  });
  app.post("/api/research", async (req, res) => {
    try {
      const {
        question,
        sourceFilter = "all",
        categoryId,
        categoryIds,
        bookIds,
        authorId,
        manualMode,
        conversationId,
        history
      } = req.body;
      if (!question || typeof question !== "string" || question.trim().length === 0) {
        return res.status(400).json({
          error: "\u0628\u0631\u0627\u06C1 \u06A9\u0631\u0645 \u0627\u067E\u0646\u0627 \u0633\u0648\u0627\u0644 \u062F\u0631\u062C \u06A9\u0631\u06CC\u06BA\u06D4"
        });
      }
      const { resolveApiKey: resolveApiKey2 } = await Promise.resolve().then(() => (init_apiKeyManager(), apiKeyManager_exports));
      const userKeyHeader = req.headers["x-gemini-api-key"];
      const apiKey = resolveApiKey2(userKeyHeader || req.body.apiKey, req);
      if (!apiKey) {
        return res.status(400).json({
          error: "Gemini API Key \u062F\u0631\u06A9\u0627\u0631 \u06C1\u06D2\u06D4 \u0628\u0631\u0627\u0626\u06D2 \u0645\u06C1\u0631\u0628\u0627\u0646\u06CC \u0627\u067E\u0646\u06CC Gemini API Key \u062F\u0631\u062C \u06A9\u0631\u06CC\u06BA\u06D4",
          requiresApiKey: true
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
        apiKey
      });
      return res.json(response);
    } catch (error) {
      console.error("Error in /api/research endpoint:", error);
      return res.status(500).json({
        error: error.message || "\u062A\u062D\u0642\u06CC\u0642 \u06A9\u06D2 \u062F\u0648\u0631\u0627\u0646 \u0633\u0631\u0648\u0631 \u067E\u0631 \u06A9\u0686\u06BE \u062E\u0631\u0627\u0628\u06CC \u067E\u06CC\u0634 \u0622\u0626\u06CC\u06D4"
      });
    }
  });
  return app;
}

// server/apiEntry.ts
var appInstance = null;
async function handler(req, res) {
  if (!appInstance) {
    appInstance = await createApp();
  }
  return appInstance(req, res);
}
export {
  handler as default
};
