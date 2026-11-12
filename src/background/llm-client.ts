import axios, { AxiosResponse } from 'axios';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiStreamOptions {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}

export async function* streamGemini(
  options: GeminiStreamOptions
): AsyncGenerator<string, void, unknown> {
  const { apiKey, model = 'gemini-2.0-flash', systemPrompt, userPrompt, signal } = options;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini API key is missing. Please set your API key in Settings.');
  }

  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

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

  let retries = 0;
  const maxRetries = 2;
  let response: AxiosResponse<ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>> | null = null;

  while (retries <= maxRetries) {
    try {
      response = await axios.post(endpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim(),
        },
        responseType: 'stream',
        adapter: 'fetch',
        signal,
      });

      break;
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new Error('Operation aborted by user.');
      }

      if (axios.isAxiosError(err)) {
        if (err.response?.status === 429 && retries < maxRetries) {
          retries++;
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
          continue;
        }

        if (err.response) {
          throw new Error(`Gemini API error (${err.response.status}): ${err.message}`);
        }
      }

      if (retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
        continue;
      }

      throw err;
    }
  }

  if (!response || !response.data) {
    throw new Error('No readable response stream received from Gemini API.');
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
              // Ignore
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
            // Ignore
          }
        }
      }
    }
  }
}
