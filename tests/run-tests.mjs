import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const testDir = path.resolve(__dirname, 'frontend');

const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => path.join('tests', 'frontend', f));

if (testFiles.length === 0) {
  console.error('No test files found in tests/frontend');
  process.exit(1);
}

const args = [
  '--loader',
  './tests/test-loader.mjs',
  '--test',
  ...testFiles,
];

const child = spawn(process.execPath, args, {
  cwd: rootDir,
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
