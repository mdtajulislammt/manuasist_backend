import { LlmClient } from './llm-client';
import { menuExtractionSchema, type MenuExtractionResult } from './schemas';

const SYSTEM_PROMPT = `You extract structured dish lines from restaurant menu OCR text.
Return JSON only with shape: { "dishes": [ { "name": string, "description"?: string, "priceText"?: string } ] }
Ignore headers, footers, and non-food lines. Merge continuation lines into one dish when obvious.`;

/**
 * Uses LLM when configured; otherwise returns a single placeholder dish from the first non-empty line.
 */
export async function extractMenuDishes(
  ocrText: string,
  llm: LlmClient,
): Promise<MenuExtractionResult> {
  const trimmed = ocrText.trim();
  if (!trimmed) {
    return { dishes: [] };
  }
  if (llm.isConfigured()) {
    return llm.completeJson(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Menu text:\n\n${trimmed.slice(0, 12000)}`,
        },
      ],
      menuExtractionSchema,
    );
  }
  const firstLine = trimmed.split(/\r?\n/).find((l) => l.trim().length > 0);
  return {
    dishes: firstLine
      ? [{ name: firstLine.trim().slice(0, 200), description: undefined }]
      : [],
  };
}
