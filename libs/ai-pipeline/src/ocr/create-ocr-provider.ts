import type { OcrProviderPort } from './ocr-provider.port';
import { FallbackOcrProvider } from './fallback.ocr';
import { GoogleVisionOcrProvider } from './google-vision.ocr';

export function createOcrProvider(config: {
  googleVisionApiKey?: string;
  provider?: string;
}): OcrProviderPort {
  const provider = (config.provider ?? 'google').toLowerCase();
  if (provider === 'google' && config.googleVisionApiKey?.trim()) {
    return new GoogleVisionOcrProvider(config.googleVisionApiKey);
  }
  return new FallbackOcrProvider();
}
