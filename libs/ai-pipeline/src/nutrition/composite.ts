import type { NutritionFacts, NutritionProvider } from './types';

/** Try providers in order; first hit wins. */
export class CompositeNutritionProvider implements NutritionProvider {
  readonly id = 'composite';

  constructor(private readonly chain: NutritionProvider[]) {}

  async lookup(
    query: string,
    signal?: AbortSignal,
  ): Promise<NutritionFacts | null> {
    for (const p of this.chain) {
      const hit = await p.lookup(query, signal);
      if (hit) {
        return hit;
      }
    }
    return null;
  }
}
