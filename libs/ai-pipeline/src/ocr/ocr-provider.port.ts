export type OcrResult = {
  text: string;
  provider: string;
  confidence?: number;
};

export interface OcrProviderPort {
  isConfigured(): boolean;
  extractText(input: {
    imageBytes: Buffer;
    mimeType: string;
  }): Promise<OcrResult>;
}
