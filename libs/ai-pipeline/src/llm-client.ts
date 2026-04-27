import type { z } from 'zod';

export type LlmChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

/**
 * Minimal OpenAI-compatible chat completions client (JSON mode).
 */
export class LlmClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts: LlmClientOptions = {}) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = opts.model ?? 'gpt-4o-mini';
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async completeJson<T>(
    messages: LlmChatMessage[],
    schema: z.ZodType<T>,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('LLM is not configured (missing API key)');
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('LLM returned empty content');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('LLM returned non-JSON content');
    }
    return schema.parse(parsed);
  }
}
