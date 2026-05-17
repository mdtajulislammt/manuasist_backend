import type { OcrProviderPort, OcrResult } from './ocr-provider.port';

type VisionResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    error?: { message?: string };
  }>;
};

/**
 * Google Cloud Vision document text detection via REST API.
 * Set GOOGLE_VISION_API_KEY (API key with Vision API enabled).
 */
export class GoogleVisionOcrProvider implements OcrProviderPort {
  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  async extractText(input: {
    imageBytes: Buffer;
    mimeType: string;
  }): Promise<OcrResult> {
    if (!this.isConfigured()) {
      throw new Error('Google Vision OCR is not configured');
    }
    const base64 = input.imageBytes.toString('base64');
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(this.apiKey!)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Vision OCR failed (${res.status}): ${errText.slice(0, 300)}`);
    }
    const json = (await res.json()) as VisionResponse;
    const first = json.responses?.[0];
    if (first?.error?.message) {
      throw new Error(`Google Vision OCR error: ${first.error.message}`);
    }
    const text = first?.fullTextAnnotation?.text?.trim() ?? '';
    if (!text) {
      throw new Error('Google Vision OCR returned no text');
    }
    return {
      text,
      provider: 'google_vision',
      confidence: 0.85,
    };
  }
}
