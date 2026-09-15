import { GoogleGenAI, Type } from '@google/genai';
import { SourceCitation } from '../src/types.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: SourceCitation[];
}

export interface ConversationSession {
  id: string;
  messages: ChatMessage[];
  categoryIds?: string[];
  bookIds?: string[];
  currentTopic?: string;
  currentQuestion?: string;
  relevantEvidence?: string;
}

// Simple in-memory session store for server-side persistence
const sessionStore = new Map<string, ConversationSession>();

export function getOrCreateSession(conversationId: string): ConversationSession {
  if (!sessionStore.has(conversationId)) {
    sessionStore.set(conversationId, {
      id: conversationId,
      messages: [],
      categoryIds: [],
      bookIds: [],
    });
  }
  return sessionStore.get(conversationId)!;
}

export function saveSession(session: ConversationSession) {
  sessionStore.set(session.id, session);
}

/**
 * Intelligent Anaphora/Conversational Query Resolver
 * Determines if a query is a follow-up or unrelated, resolves pronouns to target subjects, and updates filter scopes.
 */
export async function resolveConversationalQuery(
  conversationId: string,
  history: ChatMessage[],
  userMessage: string,
  overrideKey?: string
): Promise<{
  resolvedQuestion: string;
  isFollowUp: boolean;
  categoryIds?: string[];
  bookIds?: string[];
  isUnrelated: boolean;
}> {
  const session = getOrCreateSession(conversationId);
  
  // Sync in-memory session messages with incoming client history if provided
  if (history && history.length > 0) {
    session.messages = history;
  }

  // If there are no previous messages, it must be a new standalone query
  if (session.messages.length === 0) {
    return {
      resolvedQuestion: userMessage,
      isFollowUp: false,
      isUnrelated: true,
      categoryIds: session.categoryIds,
      bookIds: session.bookIds,
    };
  }

  const apiKey = overrideKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      resolvedQuestion: userMessage,
      isFollowUp: false,
      isUnrelated: true,
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
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
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-flash-latest',
  ].filter(Boolean) as string[];

  // Keep the last 15 messages for rich, comprehensive context memory to preserve all listings/conditions discussed
  const compactHistory = session.messages.slice(-15).map(m => ({
    role: m.role,
    text: m.text.substring(0, 6000),
  }));

  const systemInstruction = `You are an expert Fiqh research context analyzer.
Analyze the user's latest query in the context of the recent chat history.
Your job is to:
1. Determine if the query is a FOLLOW-UP question to the previous discussion/topic, or a completely NEW, UNRELATED research question.
2. If it is a FOLLOW-UP, identify all pronouns (e.g. "اس", "اس کی", "اس میں", "مذکورہ", "مذکورہ بالا", "ان", "یہ", "وہ") or context clues (e.g. "پہلی شرط", "پانچ شرائط", "باقی شرائط", "مزید جزئیات", "اوپر والا مسئلہ", "اسی مسئلے", "تفصیل", "عربی عبارت", "ترجمہ") and resolve them to the previous topics/answers.
3. Formulate a highly independent, standalone Fiqh research question in Urdu/Arabic that fully merges the original subject and context with the new user instruction (e.g., if previous answer discussed 5 conditions of "بیع الوفا" and user asks "ان پانچ شرائط کے علاوہ جو شرائط ہیں ان کی جزئیات بھی بیان کریں", resolve it to a query seeking additional conditions or details of بیع الوفا beyond those specific five).
4. If it is an entirely unrelated question (e.g., changing topics completely), classify isUnrelated as true and resolvedQuestion as the user's raw message.
5. Check if the user is asking to restrict or modify the target sources, books, or schools of thought (e.g., "اب صرف الہدایہ دیکھیں", "صرف حنفی کتب میں تلاش کریں"). If so, identify the requested scope.

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
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isFollowUp: { type: Type.BOOLEAN, description: 'Is this query a direct follow-up or refinement of the previous topic?' },
              isUnrelated: { type: Type.BOOLEAN, description: 'Is this a completely new unrelated topic?' },
              resolvedQuestion: { type: Type.STRING, description: 'The independent, standalone Fiqh research question resolving all context clues.' },
              requestedScopeUpdate: {
                type: Type.OBJECT,
                properties: {
                  madhhabFilter: { type: Type.STRING, description: 'e.g. "hanafi", "shafi", "all" if requested' },
                  specificBookName: { type: Type.STRING, description: 'Specific book name mentioned, if any' },
                  allHanafiRequested: { type: Type.BOOLEAN, description: 'Set to true if user asked for all Hanafi books' }
                }
              }
            },
            required: ['isFollowUp', 'isUnrelated', 'resolvedQuestion'],
          },
        },
      });

      if (response && response.text) {
        const result = JSON.parse(response.text);
        
        // Handle conversational scope updates
        if (result.requestedScopeUpdate) {
          const update = result.requestedScopeUpdate;
          if (update.allHanafiRequested || update.madhhabFilter === 'hanafi') {
            session.categoryIds = ['14']; // Hanafi category ID
            session.bookIds = []; // clear specific books to search all in Hanafi
          } else if (update.madhhabFilter === 'all') {
            session.categoryIds = [];
            session.bookIds = [];
          }
          
          if (update.specificBookName) {
            // Note: In real scenarios, specific book name matching is resolved on the frontend catalog search.
            // We can log this or let the client find/update it.
            console.log(`[ConversationManager] User requested specific book limit: "${update.specificBookName}"`);
          }
        }

        return {
          resolvedQuestion: result.resolvedQuestion || userMessage,
          isFollowUp: result.isFollowUp,
          categoryIds: session.categoryIds,
          bookIds: session.bookIds,
          isUnrelated: result.isUnrelated,
        };
      }
    } catch (err: any) {
      console.warn(`[ConversationManager] Error resolving query using ${modelName}:`, err?.message || err);
    }
  }

  // Fallback
  return {
    resolvedQuestion: userMessage,
    isFollowUp: false,
    isUnrelated: true,
  };
}
