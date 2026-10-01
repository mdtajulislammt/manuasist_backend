import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const targets = [
  'dist',
  'coverage',
  'libs/api-auth/dist',
  'libs/file-storage/dist',
  'libs/ai-pipeline/dist',
];

for (const relative of targets) {
  const full = join(root, relative);
  if (!existsSync(full)) {
    console.log(`skip (missing): ${relative}`);
    continue;
  }
  rmSync(full, { recursive: true, force: true });
  console.log(`removed: ${relative}`);
}

console.log('Build artifacts cleaned.');
