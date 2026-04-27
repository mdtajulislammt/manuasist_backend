export type NutritionFacts = {
  calories: number;
  proteinG?: number;
  carbG?: number;
  fatG?: number;
  source: string;
  confidence: number;
};

export interface NutritionProvider {
  readonly id: string;
  lookup(query: string, signal?: AbortSignal): Promise<NutritionFacts | null>;
}
