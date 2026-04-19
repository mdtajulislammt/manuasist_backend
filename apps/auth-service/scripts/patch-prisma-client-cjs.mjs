/**
 * Prisma 7 emits import.meta in client.ts; Nest `tsc` → CJS leaves import.meta and Node mis-handles the file.
 * Run automatically after `prisma generate` (see root `prisma:generate:auth`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientTs = path.join(root, 'generated', 'prisma', 'client.ts');
const before = `import * as process from 'node:process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))`;
const after = `import * as process from 'node:process'
/** Nest CJS: replace import.meta dirname hack (see \`scripts/patch-prisma-client-cjs.mjs\`). */
declare const __dirname: string
globalThis['__dirname'] = __dirname`;
let s = fs.readFileSync(clientTs, 'utf8');
if (!s.includes('import.meta.url')) {
  process.exit(0);
}
if (!s.includes(before)) {
  console.warn(
    'patch-prisma-client-cjs: client.ts format changed; update this script (Prisma upgrade?).',
  );
  process.exit(0);
}
fs.writeFileSync(clientTs, s.replace(before, after));
console.log('patched', clientTs);
