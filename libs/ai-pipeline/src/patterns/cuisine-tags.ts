const CUISINE_KEYWORDS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: 'italian', pattern: /\b(pasta|pizza|risotto|parmesan|marinara)\b/i },
  { tag: 'mexican', pattern: /\b(taco|burrito|salsa|queso|enchilada)\b/i },
  { tag: 'japanese', pattern: /\b(sushi|ramen|miso|teriyaki|tempura)\b/i },
  { tag: 'indian', pattern: /\b(curry|tikka|masala|naan|biryani)\b/i },
  { tag: 'thai', pattern: /\b(pad thai|tom yum|basil|lemongrass)\b/i },
  { tag: 'american', pattern: /\b(burger|bbq|wings|mac and cheese)\b/i },
  { tag: 'mediterranean', pattern: /\b(hummus|falafel|tzatziki|feta|shawarma)\b/i },
];

export function detectCuisineTags(dishNames: string[]): string[] {
  const text = dishNames.join(' ').toLowerCase();
  const tags = new Set<string>();
  for (const { tag, pattern } of CUISINE_KEYWORDS) {
    if (pattern.test(text)) {
      tags.add(tag);
    }
  }
  return [...tags];
}

export function mergeCuisineCounts(
  existing: Array<{ tag: string; count: number }>,
  newTags: string[],
): Array<{ tag: string; count: number }> {
  const map = new Map<string, number>();
  for (const row of existing) {
    map.set(row.tag, row.count);
  }
  for (const tag of newTags) {
    map.set(tag, (map.get(tag) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
