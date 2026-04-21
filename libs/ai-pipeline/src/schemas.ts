import { z } from 'zod';

/** LLM menu line extraction (strict JSON) */
export const extractedDishLineSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceText: z.string().optional(),
});

export const menuExtractionSchema = z.object({
  dishes: z.array(extractedDishLineSchema),
});

export type MenuExtractionResult = z.infer<typeof menuExtractionSchema>;
export type ExtractedDishLine = z.infer<typeof extractedDishLineSchema>;

export const dishClassificationSchema = z.object({
  category: z.enum(['RECOMMENDED', 'CAUTION', 'AVOID']),
  dietScore: z.number().int().min(0).max(100),
  allergenFlags: z.record(z.string(), z.boolean()).optional(),
});

export type DishClassification = z.infer<typeof dishClassificationSchema>;
