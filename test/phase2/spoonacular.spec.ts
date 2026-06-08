import { SpoonacularClient, FOOD_FALLBACKS } from '../../libs/ai-pipeline/src/spoonacular';

describe('SpoonacularClient', () => {
  let originalFetch: typeof fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('uses default fallback if query is empty', async () => {
    const client = new SpoonacularClient('dummy-key');
    const url = await client.getDishImage('');
    expect(url).toBe(FOOD_FALLBACKS.default);
  });

  it('uses local fallback if not configured (apiKey is undefined)', async () => {
    const client = new SpoonacularClient(undefined);
    // query "caesar salad" contains "salad"
    const url = await client.getDishImage('caesar salad');
    expect(url).toBe(FOOD_FALLBACKS.salad);
  });

  it('uses local fallback if api returns no results', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ results: [] }),
    } as any);

    const client = new SpoonacularClient('dummy-key');
    const url = await client.getDishImage('margherita pizza');
    expect(url).toBe(FOOD_FALLBACKS.pizza);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses spoonacular image if found', async () => {
    const mockImageUrl = 'https://spoonacular.com/recipes/chicken-salad.jpg';
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        results: [{ image: mockImageUrl }],
      }),
    } as any);

    const client = new SpoonacularClient('dummy-key');
    const url = await client.getDishImage('delicious chicken salad');
    expect(url).toBe(mockImageUrl);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses fallback if API request fails', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network Error'));

    const client = new SpoonacularClient('dummy-key');
    const url = await client.getDishImage('classic juicy burger');
    expect(url).toBe(FOOD_FALLBACKS.burger);
  });
});
