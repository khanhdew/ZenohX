/**
 * Formats and beautifies JavaScript / TypeScript code with clean 2-space indentation.
 */
export function formatJsCode(code: string): string {
  if (!code || !code.trim()) return '';

  const lines = code.split(/\r?\n/);
  let indentLevel = 0;
  const formattedLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      // Keep single blank line between blocks, avoid consecutive blank lines
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      continue;
    }

    // Check for closing braces/brackets at the beginning of the line
    const leadingCloseMatch = line.match(/^(\}|\)|\])+/);
    const leadingCloseCount = leadingCloseMatch ? leadingCloseMatch[0].length : 0;

    const currentIndent = Math.max(0, indentLevel - leadingCloseCount);
    const indentStr = '  '.repeat(currentIndent);

    // Scan the line to count opens vs closes (ignoring strings and comments)
    let openCount = 0;
    let closeCount = 0;
    let inString: string | null = null;
    let isEscaped = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (inString) {
        if (char === inString) {
          inString = null;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = char;
      } else if (char === '/' && line[i + 1] === '/') {
        break; // Single line comment: ignore rest of line
      } else if (char === '{' || char === '(' || char === '[') {
        openCount++;
      } else if (char === '}' || char === ')' || char === ']') {
        closeCount++;
      }
    }

    // Update ongoing indent level for next lines
    indentLevel = Math.max(0, indentLevel + (openCount - closeCount));

    formattedLines.push(indentStr + line);
  }

  return formattedLines.join('\n').trim();
}
