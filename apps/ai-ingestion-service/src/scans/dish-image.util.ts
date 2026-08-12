import { createHash } from 'node:crypto';
import {
  detectCuisineTags,
  type ExtractedDishLine,
} from '../../../../libs/ai-pipeline/src';

const PROMPT_VERSION = 'dish-image-v1';

export function dishImageFingerprint(dish: ExtractedDishLine): string {
  const identity = [
    PROMPT_VERSION,
    normalize(dish.name),
    normalize(dish.description ?? ''),
  ].join('|');
  return createHash('sha256').update(identity).digest('hex');
}

export function buildDishImagePrompt(dish: ExtractedDishLine): string {
  const description = dish.description?.trim();
  const cuisine = detectCuisineTags([
    `${dish.name} ${description ?? ''}`,
  ])[0];
  const preparation = detectPreparation(`${dish.name} ${description ?? ''}`);

  const details = [
    `Dish name: ${dish.name.trim()}.`,
    description ? `Menu description and ingredients: ${description}.` : null,
    cuisine ? `Cuisine: ${cuisine}.` : null,
    preparation ? `Preparation style: ${preparation}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return [
    'Create a realistic, appetizing editorial food photograph of the exact restaurant dish described below.',
    details,
    'Show one plated serving, accurate visible ingredients, natural restaurant lighting, three-quarter camera angle, shallow depth of field.',
    'Do not add ingredients not supported by the description. No people, text, labels, logos, menus, packaging, watermarks, or collage.',
  ].join(' ');
}

function detectPreparation(text: string): string | null {
  const normalized = text.toLowerCase();
  const styles = [
    'grilled',
    'fried',
    'baked',
    'roasted',
    'steamed',
    'smoked',
    'braised',
    'poached',
    'raw',
    'creamy',
  ];
  return styles.find((style) => normalized.includes(style)) ?? null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
