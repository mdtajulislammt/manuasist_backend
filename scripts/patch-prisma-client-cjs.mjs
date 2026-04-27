/**
 * Prisma 7 emits import.meta in client.ts; Nest `tsc` with CJS expects __dirname.
 * Run after `prisma generate` for each app that bundles generated/prisma (see root package.json prisma:generate:*).
 *
 * Usage: node scripts/patch-prisma-client-cjs.mjs apps/admin-service
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceArg = process.argv[2];
if (!serviceArg) {
  console.error('usage: node scripts/patch-prisma-client-cjs.mjs <path-to-app-from-repo-root>');
  process.exit(1);
}

const serviceRoot = path.isAbsolute(serviceArg)
  ? serviceArg
  : path.resolve(process.cwd(), serviceArg);
const clientTs = path.join(serviceRoot, 'generated', 'prisma', 'client.ts');

const before = `import * as process from 'node:process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))`;
const after = `import * as process from 'node:process'
/** Nest CJS: replace import.meta dirname hack (see \`scripts/patch-prisma-client-cjs.mjs\`). */
declare const __dirname: string
globalThis['__dirname'] = __dirname`;

if (!fs.existsSync(clientTs)) {
  console.error('patch-prisma-client-cjs: missing', clientTs);
  process.exit(1);
}

let s = fs.readFileSync(clientTs, 'utf8');
if (!s.includes('import.meta.url')) {
  process.exit(0);
}
if (!s.includes(before)) {
  console.warn(
    'patch-prisma-client-cjs: client.ts format changed; update scripts/patch-prisma-client-cjs.mjs (Prisma upgrade?).',
  );
  process.exit(0);
}
fs.writeFileSync(clientTs, s.replace(before, after));
console.log('patched', clientTs);
