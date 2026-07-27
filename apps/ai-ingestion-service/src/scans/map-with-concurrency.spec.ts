import { mapWithConcurrency } from './map-with-concurrency';

describe('mapWithConcurrency', () => {
  it('preserves input order with bounded concurrency', async () => {
    const started: number[] = [];
    const maxInFlight = { current: 0, peak: 0 };

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      maxInFlight.current += 1;
      maxInFlight.peak = Math.max(maxInFlight.peak, maxInFlight.current);
      await new Promise((r) => setTimeout(r, 20 - n));
      maxInFlight.current -= 1;
      return n * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxInFlight.peak).toBeLessThanOrEqual(2);
    expect(started).toHaveLength(5);
  });

  it('returns empty array for empty input', async () => {
    const results = await mapWithConcurrency([], 4, async (n: number) => n);
    expect(results).toEqual([]);
  });
});
