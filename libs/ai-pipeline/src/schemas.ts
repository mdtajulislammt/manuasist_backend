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

export const reasonCodeSchema = z.enum([
  'DIET_ALIGN',
  'ALLERGEN',
  'MACRO',
  'SPICE',
  'CALORIE',
  'UNCERTAIN',
  'GENERAL',
]);

export const classificationReasonSchema = z.object({
  code: reasonCodeSchema,
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string().min(1),
});

export const dishClassificationSchema = z.object({
  category: z.enum(['RECOMMENDED', 'CAUTION', 'AVOID']),
  dietScore: z.number().int().min(0).max(100),
  allergenFlags: z.record(z.string(), z.boolean()).optional(),
  reasons: z.array(classificationReasonSchema).min(1).optional(),
  summary: z.string().optional(),
});

export type DishClassification = z.infer<typeof dishClassificationSchema>;
export type ClassificationReason = z.infer<typeof classificationReasonSchema>;
