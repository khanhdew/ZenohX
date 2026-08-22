import fs from 'node:fs';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.')) {
      const parentUrl = new URL(context.parentURL);
      const targetPath = path.resolve(path.dirname(parentUrl.pathname), specifier);
      if (fs.existsSync(targetPath + '.ts')) {
        return nextResolve(specifier + '.ts', context);
      }
      if (fs.existsSync(targetPath + '.tsx')) {
        return nextResolve(specifier + '.tsx', context);
      }
      if (fs.existsSync(targetPath + '.js')) {
        return nextResolve(specifier + '.js', context);
      }
    }
    throw err;
  }
}
