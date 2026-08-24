import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const testsDir = path.resolve(__dirname);

function findTestFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      results.push(path.relative(rootDir, fullPath));
    }
  }
  return results;
}

const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
let testFiles = cliArgs.length > 0
  ? cliArgs
  : findTestFiles(testsDir);

if (testFiles.length === 0) {
  console.error('No test files found in tests/');
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

