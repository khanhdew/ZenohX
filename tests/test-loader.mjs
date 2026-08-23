import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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
        // Fall through
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const filePath = fileURLToPath(url);
    const rawSource = fs.readFileSync(filePath, 'utf8');
    const { outputText } = ts.transpileModule(rawSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });

    return {
      format: 'module',
      shortCircuit: true,
      source: outputText,
    };
  }

  if (url.endsWith('.json')) {
    const filePath = fileURLToPath(url);
    const rawSource = fs.readFileSync(filePath, 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${rawSource};`,
    };
  }

  return nextLoad(url, context);
}
