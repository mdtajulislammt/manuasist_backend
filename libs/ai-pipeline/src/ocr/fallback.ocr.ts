import type { OcrProviderPort, OcrResult } from './ocr-provider.port';

/** Used when no OCR API key is configured — minimal demo text for local dev. */
export class FallbackOcrProvider implements OcrProviderPort {
  isConfigured(): boolean {
    return true;
  }

  async extractText(_input: {
    imageBytes: Buffer;
    mimeType: string;
  }): Promise<OcrResult> {
    return {
      text: [
        'Grilled Salmon Bowl — herb rice, seasonal vegetables',
        'Classic Caesar Salad — parmesan, croutons',
        'Margherita Pizza — tomato, mozzarella, basil',
      ].join('\n'),
      provider: 'fallback',
      confidence: 0.1,
    };
  }
}
