import axios from 'axios';

export interface GeminiStreamOptions {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}

export interface SupportedModelInfo {
  model: string;
  apiVersion: 'v1' | 'v1beta';
}

async function extractGeminiErrorMessage(err: unknown): Promise<string> {
  if (axios.isAxiosError(err)) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;

      if (typeof data === 'object' && data !== null) {
        const msg = (data as any).error?.message || (data as any).message;
        if (msg) return `Gemini API error (${status}): ${msg}`;
      } else if (typeof data === 'string' && data.trim()) {
        try {
          const parsed = JSON.parse(data);
          const msg = parsed.error?.message || parsed.message;
          if (msg) return `Gemini API error (${status}): ${msg}`;
        } catch {
          return `Gemini API error (${status}): ${data.trim().slice(0, 300)}`;
        }
      }

      return `Gemini API error (${status}): ${err.message}`;
    }
    return `Network error: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function cleanModelName(model?: string): string {
  if (!model || typeof model !== 'string') return 'gemini-3.5-flash';
  const trimmed = model.trim().replace(/^models\//, '');
  if (trimmed === 'gemini-2.0-flash' || trimmed === 'gemini-2.0-flash-exp' || trimmed === 'gemini-2.5-flash') {
    return 'gemini-3.5-flash';
  }
  return trimmed || 'gemini-3.5-flash';
}

export async function* streamGemini(
  options: GeminiStreamOptions
): AsyncGenerator<string, void, unknown> {
  const { apiKey, model, systemPrompt, userPrompt, signal } = options;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini API key is missing. Please set your API key in Settings.');
  }

  const cleanKey = apiKey.trim();
  const requestedModel = cleanModelName(model);

  // Fast, lean candidate queue: try requested model first, then the universal flash endpoints
  const targetsToTry: SupportedModelInfo[] = [];
  const addTarget = (m: string, apiVersion: 'v1' | 'v1beta') => {
    const cleaned = cleanModelName(m);
    if (!targetsToTry.some((t) => t.model === cleaned && t.apiVersion === apiVersion)) {
      targetsToTry.push({ model: cleaned, apiVersion });
    }
  };

  // 1. Requested model first
  addTarget(requestedModel, 'v1beta');
  addTarget(requestedModel, 'v1');

  // 2. Verified working models on user's API key (prioritizing fast flash-lite)
  addTarget('gemini-flash-lite-latest', 'v1beta');
  addTarget('gemini-3.5-flash', 'v1beta');
  addTarget('gemini-3.5-flash-lite', 'v1beta');
  addTarget('gemini-flash-latest', 'v1beta');
  addTarget('gemini-3.8-flash', 'v1beta');
  addTarget('gemini-1.5-flash', 'v1beta');

  const requestBody = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  let generatedText: string | null = null;
  let lastError: Error | null = null;

  for (let idx = 0; idx < targetsToTry.length; idx++) {
    const target = targetsToTry[idx];
    const endpoint = `https://generativelanguage.googleapis.com/${target.apiVersion}/models/${encodeURIComponent(target.model)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

    try {
      const response = await axios.post(endpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey,
        },
        adapter: 'fetch',
        timeout: 25000, // Generous 25s timeout allowing complete server generation
        signal,
      });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text === 'string' && text.trim().length > 0) {
        generatedText = text.trim();
        break;
      }
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new Error('Operation aborted by user.');
      }

      const formattedError = await extractGeminiErrorMessage(err);
      lastError = new Error(formattedError);

      // Check if error explicitly recommends a specific replacement model
      const suggestionMatch = formattedError.match(/use\s+models\/([a-zA-Z0-9._-]+)/i);
      if (suggestionMatch && suggestionMatch[1]) {
        const suggested = cleanModelName(suggestionMatch[1]);
        addTarget(suggested, 'v1beta');
        addTarget(suggested, 'v1');
      }

      // If 404 or 400, immediately skip to next candidate with zero delay
      if (axios.isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 400)) {
        continue;
      }

      // For rate limits or network issues, try next candidate
      continue;
    }
  }

  if (!generatedText) {
    throw lastError || new Error('No valid response received from Gemini API.');
  }

  // Yield response in chunks to maintain reactive thought display
  const words = generatedText.split(' ');
  const chunkSize = 6;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ') + ' ';
    yield chunk;
    await new Promise((r) => setTimeout(r, 10));
  }
}
