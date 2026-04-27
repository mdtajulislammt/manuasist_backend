export type EmbeddingClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

/**
 * OpenAI-compatible embeddings API. Optional — returns null when not configured.
 */
export class EmbeddingClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts: EmbeddingClientOptions = {}) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = opts.model ?? 'text-embedding-3-small';
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /** Returns embedding vector or null if not configured / on failure. */
  async embedText(text: string): Promise<number[] | null> {
    if (!this.isConfigured()) {
      return null;
    }
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const vec = body.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  }
}
