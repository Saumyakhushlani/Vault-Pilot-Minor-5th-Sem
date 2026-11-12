import axios, { AxiosResponse } from 'axios';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiStreamOptions {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}

async function extractGeminiErrorMessage(err: unknown): Promise<string> {
  if (axios.isAxiosError(err)) {
    if (err.response) {
      const status = err.response.status;
      let rawText = '';

      try {
        const data = err.response.data;
        if (typeof data === 'string') {
          rawText = data;
        } else if (data && typeof (data as any).getReader === 'function') {
          const reader = (data as ReadableStream<Uint8Array>).getReader();
          const decoder = new TextDecoder('utf-8');
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            rawText += decoder.decode(value, { stream: true });
          }
        } else if (data && Symbol.asyncIterator in Object(data)) {
          const decoder = new TextDecoder('utf-8');
          for await (const chunk of data as AsyncIterable<Uint8Array | string>) {
            rawText += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
          }
        } else if (data && typeof data === 'object') {
          rawText = JSON.stringify(data);
        }
      } catch {
        // Fallback if reading the stream fails
      }

      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          const msg = parsed.error?.message || parsed.message;
          if (msg) {
            return `Gemini API error (${status}): ${msg}`;
          }
        } catch {
          if (rawText.trim().length > 0) {
            return `Gemini API error (${status}): ${rawText.trim().slice(0, 300)}`;
          }
        }
      }

      return `Gemini API error (${status}): ${err.message}`;
    }
    return `Network error: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function cleanModelName(model?: string): string {
  if (!model || typeof model !== 'string') return 'gemini-1.5-flash';
  const trimmed = model.trim();
  return trimmed.replace(/^models\//, '') || 'gemini-1.5-flash';
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

  const modelsToTry = [requestedModel];
  if (requestedModel === 'gemini-2.0-flash') {
    modelsToTry.push('gemini-1.5-flash');
  } else if (requestedModel === 'gemini-1.5-flash') {
    modelsToTry.push('gemini-2.0-flash');
  }

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
    },
  };

  let response: AxiosResponse<ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>> | null = null;
  let lastError: Error | null = null;

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const currentModel = modelsToTry[mIdx];
    const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(currentModel)}:streamGenerateContent?key=${encodeURIComponent(cleanKey)}&alt=sse`;

    let retries = 0;
    const maxRetries = 2;
    let modelSuccess = false;

    while (retries <= maxRetries) {
      try {
        response = await axios.post(endpoint, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
          },
          responseType: 'stream',
          adapter: 'fetch',
          signal,
        });

        modelSuccess = true;
        break;
      } catch (err: unknown) {
        if (signal?.aborted) {
          throw new Error('Operation aborted by user.');
        }

        const formattedError = await extractGeminiErrorMessage(err);

        if (axios.isAxiosError(err) && err.response?.status === 404 && mIdx < modelsToTry.length - 1) {
          console.warn(`[VaultPilot] Model ${currentModel} returned 404. Attempting fallback to ${modelsToTry[mIdx + 1]}...`);
          lastError = new Error(formattedError);
          break;
        }

        if (axios.isAxiosError(err) && err.response?.status === 429 && retries < maxRetries) {
          retries++;
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
          continue;
        }

        if (retries < maxRetries && (!axios.isAxiosError(err) || !err.response || err.response.status >= 500)) {
          retries++;
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
          continue;
        }

        lastError = new Error(formattedError);
        break;
      }
    }

    if (modelSuccess && response) {
      break;
    }
  }

  if (!response || !response.data) {
    throw lastError || new Error('No readable response stream received from Gemini API.');
  }

  const stream = response.data;
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  if (typeof (stream as ReadableStream<Uint8Array>).getReader === 'function') {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textChunk) {
                yield textChunk;
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else if (Symbol.asyncIterator in Object(stream)) {
    for await (const chunk of stream as AsyncIterable<Uint8Array | string>) {
      const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textChunk) {
              yield textChunk;
            }
          } catch {
            // Ignore partial JSON chunks
          }
        }
      }
    }
  }
}
