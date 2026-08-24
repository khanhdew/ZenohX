/**
 * ZenohX Markdown Parser & AST Compiler
 * Lightweight, zero-dependency Markdown parser designed for changelogs, release notes, and documentation.
 */

export type BadgeVariant = 'feat' | 'fix' | 'breaking' | 'docs' | 'perf' | 'refactor' | 'chore' | 'security' | 'default';

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strikethrough'; value: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'badge'; variant: BadgeVariant; label: string };

export interface ListItemNode {
  inlines: InlineToken[];
  checked?: boolean;
}

export type BlockNode =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; inlines: InlineToken[]; raw: string }
  | { type: 'paragraph'; inlines: InlineToken[]; raw: string }
  | { type: 'list'; ordered: boolean; items: ListItemNode[] }
  | { type: 'code_block'; language?: string; code: string }
  | { type: 'blockquote'; inlines: InlineToken[]; raw: string }
  | { type: 'thematic_break' }
  | { type: 'table'; headers: InlineToken[][]; rows: InlineToken[][][] };

/**
 * Parses inline markdown tokens from a text string.
 */
export function parseInlineMarkdown(text: string): InlineToken[] {
  if (!text) return [];

  const tokens: InlineToken[] = [];
  let remaining = text;

  // Regex patterns for inline syntax
  // 1. Link: [text](url)
  // 2. Inline Code: `code`
  // 3. Bold: **text** or __text__
  // 4. Strikethrough: ~~text~~
  // 5. Italic: *text* or _text_
  // 6. Badges: feat:, fix:, breaking:, etc.
  // 7. Bare URL: https://... or http://...

  const inlineRegex =
    /(\[([^\]]+)\]\((https?:\/\/[^\s\)]+|[^\s\)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*|__([^_]+)__)|(~~([^~]+)~~)|(\*([^*]+)\*|_([^_]+)_)|(\b(feat|fix|breaking|docs|perf|refactor|chore|security):)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/i;

  while (remaining.length > 0) {
    const match = remaining.match(inlineRegex);
    if (!match || match.index === undefined) {
      tokens.push({ type: 'text', value: remaining });
      break;
    }

    // Push text before match
    if (match.index > 0) {
      tokens.push({ type: 'text', value: remaining.slice(0, match.index) });
    }

    const matchedStr = match[0];
    const matchIndex = match.index;

    if (match[1]) {
      // [text](url)
      tokens.push({
        type: 'link',
        text: match[2],
        href: match[3],
      });
    } else if (match[4]) {
      // `code`
      tokens.push({
        type: 'code',
        value: match[5],
      });
    } else if (match[6]) {
      // **bold**
      tokens.push({
        type: 'bold',
        value: match[7] || match[8],
      });
    } else if (match[9]) {
      // ~~strikethrough~~
      tokens.push({
        type: 'strikethrough',
        value: match[10],
      });
    } else if (match[11]) {
      // *italic*
      tokens.push({
        type: 'italic',
        value: match[12] || match[13],
      });
    } else if (match[14]) {
      // Badge keyword (e.g. feat:)
      const rawTag = (match[15] || '').toLowerCase();
      const variant: BadgeVariant =
        rawTag === 'breaking'
          ? 'breaking'
          : rawTag === 'feat'
          ? 'feat'
          : rawTag === 'fix'
          ? 'fix'
          : rawTag === 'perf'
          ? 'perf'
          : rawTag === 'refactor'
          ? 'refactor'
          : rawTag === 'docs'
          ? 'docs'
          : rawTag === 'chore'
          ? 'chore'
          : rawTag === 'security'
          ? 'security'
          : 'default';
      tokens.push({
        type: 'badge',
        variant,
        label: match[14],
      });
    } else if (match[16]) {
      // Bare URL
      const url = match[16];
      tokens.push({
        type: 'link',
        text: url,
        href: url,
      });
    }

    remaining = remaining.slice(matchIndex + matchedStr.length);
  }

  return tokens;
}

/**
 * Parses full Markdown string into an array of structured BlockNodes.
 */
export function parseMarkdown(markdown: string): BlockNode[] {
  if (!markdown || !markdown.trim()) return [];

  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nodes: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Fenced Code Block
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const fence = trimmed.slice(0, 3);
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;

      while (i < lines.length) {
        if (lines[i].trim().startsWith(fence)) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }

      nodes.push({
        type: 'code_block',
        language: language || undefined,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // 2. Thematic Break / Horizontal Rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      nodes.push({ type: 'thematic_break' });
      i++;
      continue;
    }

    // 3. Headings (# H1 to ###### H6)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const headingText = headingMatch[2].trim();
      nodes.push({
        type: 'heading',
        level,
        raw: headingText,
        inlines: parseInlineMarkdown(headingText),
      });
      i++;
      continue;
    }

    // 4. Blockquotes (> quote)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const fullQuote = quoteLines.join(' ');
      nodes.push({
        type: 'blockquote',
        raw: fullQuote,
        inlines: parseInlineMarkdown(fullQuote),
      });
      continue;
    }

    // 5. Tables (| Header | Header |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].includes('-')) {
      const headerLine = trimmed;

      const rawHeaders = headerLine
        .slice(1, -1)
        .split('|')
        .map((h) => h.trim());
      const headers = rawHeaders.map((h) => parseInlineMarkdown(h));

      i += 2;
      const rows: InlineToken[][][] = [];

      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const rawCells = lines[i]
          .trim()
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        rows.push(rawCells.map((c) => parseInlineMarkdown(c)));
        i++;
      }

      nodes.push({
        type: 'table',
        headers,
        rows,
      });
      continue;
    }

    // 6. List Items (Unordered, Ordered, Task Lists)
    const unorderedMatch = trimmed.match(/^([-*+])\s+(.*)$/);
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: ListItemNode[] = [];

      while (i < lines.length) {
        const curTrimmed = lines[i].trim();
        const curUnordered = curTrimmed.match(/^([-*+])\s+(.*)$/);
        const curOrdered = curTrimmed.match(/^(\d+)\.\s+(.*)$/);

        if ((!ordered && curUnordered) || (ordered && curOrdered)) {
          let itemText = curUnordered ? curUnordered[2] : curOrdered ? curOrdered[2] : '';
          let checked: boolean | undefined;

          const taskMatch = itemText.match(/^\[([ xX])\]\s+(.*)$/);
          if (taskMatch) {
            checked = taskMatch[1].toLowerCase() === 'x';
            itemText = taskMatch[2];
          }

          items.push({
            checked,
            inlines: parseInlineMarkdown(itemText),
          });
          i++;
        } else if (curTrimmed.length > 0 && (lines[i].startsWith('  ') || lines[i].startsWith('\t')) && items.length > 0) {
          // Continuation line of previous list item
          const lastItem = items[items.length - 1];
          lastItem.inlines.push({ type: 'text', value: ' ' + curTrimmed });
          i++;
        } else {
          break;
        }
      }

      nodes.push({
        type: 'list',
        ordered,
        items,
      });
      continue;
    }

    // 7. Regular Paragraph
    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('~~~') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().match(/^[-*+]\s+/) &&
      !lines[i].trim().match(/^\d+\.\s+/) &&
      !/^(?:---|\*\*\*|___)\s*$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    const fullPara = paraLines.join(' ');
    nodes.push({
      type: 'paragraph',
      raw: fullPara,
      inlines: parseInlineMarkdown(fullPara),
    });
  }

  return nodes;
}
