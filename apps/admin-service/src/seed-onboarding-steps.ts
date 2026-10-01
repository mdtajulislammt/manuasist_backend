import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type SeedOnboardingStep = {
  orderIndex: number;
  title: string;
  subtitle: string;
  uiConfig: Record<string, unknown>;
};

type StepsFile = {
  steps: SeedOnboardingStep[];
};

function parseStepsFile(path: string): SeedOnboardingStep[] {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as StepsFile;
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error(`Onboarding steps file is empty or invalid: ${path}`);
  }
  return parsed.steps;
}

export function loadDefaultOnboardingSteps(): SeedOnboardingStep[] {
  const cwd = process.cwd();
  const customPath = process.env.ADMIN_SEED_STEPS_PATH?.trim();

  const candidates = [
    customPath ? resolve(customPath) : null,
    resolve(cwd, 'steps.txt'),
    resolve(cwd, 'apps/admin-service/src/seed-data/default-onboarding-steps.json'),
    resolve(__dirname, 'seed-data/default-onboarding-steps.json'),
  ].filter((path): path is string => Boolean(path));

  for (const path of candidates) {
    if (existsSync(path)) {
      return parseStepsFile(path);
    }
  }

  throw new Error(
    'No onboarding steps seed file found. Add steps.txt at repo root or set ADMIN_SEED_STEPS_PATH.',
  );
}
