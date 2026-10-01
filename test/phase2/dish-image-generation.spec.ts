import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock(
  '../../apps/ai-ingestion-service/src/prisma.service',
  () => ({ PrismaService: class PrismaService {} }),
);

import { ImageGenerationClient } from '../../libs/ai-pipeline/src/image-generation-client';
import {
  buildDishImagePrompt,
  dishImageFingerprint,
} from '../../apps/ai-ingestion-service/src/scans/dish-image.util';
import { DishImageService } from '../../apps/ai-ingestion-service/src/scans/dish-image.service';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('dish image generation', () => {
  it('decodes generated image bytes from the OpenAI Images API', async () => {
    const bytes = Buffer.from('generated-webp-bytes');
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: bytes.toString('base64') }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    global.fetch = fetchMock;

    const client = new ImageGenerationClient({
      apiKey: 'test-key',
      model: 'gpt-image-1',
    });
    const generated = await client.generate('A grilled salmon bowl');

    expect(generated.buffer).toEqual(bytes);
    expect(generated.contentType).toBe('image/webp');
    expect(generated.model).toBe('gpt-image-1');

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe(
      'https://api.openai.com/v1/images/generations',
    );
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'A grilled salmon bowl',
      output_format: 'webp',
    });
  });

  it('creates a stable fingerprint for the same normalized dish', () => {
    const first = dishImageFingerprint({
      name: '  Grilled Salmon Bowl ',
      description: 'Herbs & lemon',
    });
    const second = dishImageFingerprint({
      name: 'grilled salmon bowl',
      description: 'herbs and lemon',
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds a constrained prompt from dish evidence', () => {
    const prompt = buildDishImagePrompt({
      name: 'Grilled Margherita Pizza',
      description: 'Tomato, fresh basil, and mozzarella',
    });

    expect(prompt).toContain('Dish name: Grilled Margherita Pizza');
    expect(prompt).toContain(
      'Menu description and ingredients: Tomato, fresh basil, and mozzarella',
    );
    expect(prompt).toContain('Cuisine: italian');
    expect(prompt).toContain('Preparation style: grilled');
    expect(prompt).toContain('Do not add ingredients');
    expect(prompt).toContain('No people, text, labels, logos');
  });

  it('stores a generated image once and reuses the fingerprint cache', async () => {
    const bytes = Buffer.from('generated-webp-bytes');
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: bytes.toString('base64') }],
        }),
        { status: 200 },
      ),
    );

    const cachedUrl =
      'https://menu-assist.example/v1/admin/files/dish-image/dish.webp';
    const prisma = {
      dishImageCache: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            imageUrl: cachedUrl,
            expiresAt: null,
          }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const configValues: Record<string, string> = {
      OPENAI_API_KEY: 'test-key',
      OPENAI_IMAGE_MODEL: 'gpt-image-1',
    };
    const config = {
      get: jest.fn((key: string) => configValues[key]),
    };
    const adminFiles = {
      uploadDishImage: jest.fn().mockResolvedValue({
        storedName: 'dish.webp',
        contentType: 'image/webp',
      }),
      buildPublicDishImageUrl: jest.fn().mockReturnValue(cachedUrl),
    };
    const service = new DishImageService(
      prisma as never,
      config as never,
      adminFiles as never,
    );
    const dish = {
      name: 'Grilled Salmon Bowl',
      description: 'Salmon, herbs, lemon, and rice',
    };

    await expect(service.getDishImage(dish)).resolves.toBe(cachedUrl);
    await expect(service.getDishImage(dish)).resolves.toBe(cachedUrl);

    expect(adminFiles.uploadDishImage).toHaveBeenCalledTimes(1);
    expect(prisma.dishImageCache.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.dishImageCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          imageUrl: cachedUrl,
          storedFileName: 'dish.webp',
          source: 'AI_GENERATED',
        }),
      }),
    );
  });
});
