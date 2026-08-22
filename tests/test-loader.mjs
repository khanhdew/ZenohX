import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && context.parentURL) {
      try {
        const parentPath = fileURLToPath(context.parentURL);
        const parentDir = path.dirname(parentPath);
        const targetPath = path.resolve(parentDir, specifier);
        if (fs.existsSync(targetPath + '.ts')) {
          return nextResolve(specifier + '.ts', context);
        }
        if (fs.existsSync(targetPath + '.tsx')) {
          return nextResolve(specifier + '.tsx', context);
        }
        if (fs.existsSync(targetPath + '.js')) {
          return nextResolve(specifier + '.js', context);
        }
      } catch {
        // Fall through to throw err
      }
    }
    throw err;
  }
}
