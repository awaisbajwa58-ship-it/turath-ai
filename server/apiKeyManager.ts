import { GoogleGenAI } from '@google/genai';
import type { Request } from 'express';

/**
 * Environment & Gemini API Key Resolution Manager
 * Manages Developer / Google AI Studio Mode vs Public / Deployed User Mode.
 */

export interface AuthStatus {
  isDevMode: boolean;
  hasServerKey: boolean;
  requiresUserKey: boolean;
  environmentName: string;
}

/**
 * Accurately determines whether a given request originates from the developer's
 * active AI Studio IDE environment vs a shared link / external visitor.
 */
export function isDeveloperRequest(req?: Request): boolean {
  // If explicitly forced to public mode via environment variable
  if (process.env.PUBLIC_MODE === 'true' || process.env.VITE_PUBLIC_MODE === 'true') {
    return false;
  }

  if (!process.env.GEMINI_API_KEY) {
    return false;
  }

  if (!req) {
    return false;
  }

  const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
  const referer = (req.headers.referer || '') as string;
  const origin = (req.headers.origin || '') as string;
  const clientEmbedded = req.headers['x-client-embedded'] as string;

  // Explicit shared link domains MUST ALWAYS be treated as Public User Mode:
  // e.g. service-2512.ai.studio, ais-pre-*, *.run.app (shared), etc.
  if (host.includes('service-') || host.includes('ais-pre-') || referer.includes('service-') || referer.includes('ais-pre-')) {
    return false;
  }

  // If client is running locally in node dev server
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return true;
  }

  // Developer environment is ONLY true if running on the dev container (ais-dev-*)
  // AND embedded inside the AI Studio workspace builder (ai.studio/build)
  if (host.includes('ais-dev-')) {
    if (clientEmbedded === 'true' || referer.includes('ai.studio') || referer.includes('aistudio.google.com')) {
      return true;
    }
    // If opened directly as a standalone URL even on ais-dev without embedding, treat as public
    if (clientEmbedded === 'false') {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Gets the authentication and environment status for a specific client request
 */
export function getAuthStatus(req?: Request): AuthStatus {
  const isDev = isDeveloperRequest(req);
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY);

  return {
    isDevMode: isDev,
    hasServerKey: hasServerKey,
    requiresUserKey: !isDev,
    environmentName: isDev ? 'AI Studio Development' : 'Public Deployed',
  };
}

/**
 * Resolves the Gemini API key to use for an incoming request.
 * - In Developer Mode: Uses server's GEMINI_API_KEY (or client override if provided).
 * - In Public / Shared Mode (service-*.ai.studio, ais-pre-*, etc.):
 *   STRICTLY REQUIRES the user-provided key. NEVER leaks or uses developer's server key.
 */
export function resolveApiKey(userKeyHeader?: string | string[], req?: Request): string | null {
  const userKey = Array.isArray(userKeyHeader) ? userKeyHeader[0] : userKeyHeader;
  
  // 1. If user provided their own key, always use it
  if (userKey && typeof userKey === 'string' && userKey.trim().length > 5) {
    return userKey.trim();
  }

  // 2. Only if the request is strictly verified as the developer in AI Studio IDE,
  // we use the server's GEMINI_API_KEY
  if (isDeveloperRequest(req)) {
    const serverKey = process.env.GEMINI_API_KEY;
    if (serverKey) {
      return serverKey;
    }
  }

  // 3. For any shared user, external user, or non-dev request without their own key, return null
  return null;
}

/**
 * Validates a Gemini API key by making a test call
 */
export async function validateGeminiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    return {
      valid: false,
      error: 'براہ کرم مکمل اور درست Gemini API Key درج کریں۔',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const candidateModels = [
      process.env.AI_MODEL,
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.7-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ].filter(Boolean) as string[];

    let validated = false;
    let lastError = '';

    for (const model of candidateModels) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: 'Test connection',
          config: {
            maxOutputTokens: 5,
          },
        });
        if (res) {
          validated = true;
          break;
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
        if (lastError.includes('API_KEY_INVALID') || lastError.includes('API key not valid') || lastError.includes('403')) {
          return {
            valid: false,
            error: 'درج کردہ API Key درست نہیں ہے۔ براہ کرم Google AI Studio سے نئی کلید حاصل کریں۔',
          };
        }
      }
    }

    if (validated) {
      return { valid: true };
    }

    return {
      valid: false,
      error: lastError || 'API Key کی تصدیق ناکام ہو گئی۔ براہ کرم درست کلید درج کریں۔',
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err?.message || 'API Key کی تصدیق کے دوران خرابی پیش آئی۔',
    };
  }
}
