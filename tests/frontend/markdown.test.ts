import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInlineMarkdown, type BlockNode, type InlineToken } from '../../src/lib/markdown';

describe('Markdown Compiler & Parser for Changelogs', () => {
  test('handles empty and null inputs safely', () => {
    assert.deepEqual(parseMarkdown(''), []);
    assert.deepEqual(parseMarkdown('   \n\n  '), []);
  });

  test('parses headings levels 1 through 6 with inline tokens', () => {
    const md = `# ZenohX v0.5.0 Release
## Features & Improvements
### **Breaking** Changes
#### Bug Fixes
##### Performance
###### Notes`;

    const nodes = parseMarkdown(md);
    assert.equal(nodes.length, 6);
    assert.equal(nodes[0].type, 'heading');
    if (nodes[0].type === 'heading') {
      assert.equal(nodes[0].level, 1);
      assert.equal(nodes[0].raw, 'ZenohX v0.5.0 Release');
    }

    if (nodes[1].type === 'heading') {
      assert.equal(nodes[1].level, 2);
      assert.equal(nodes[1].raw, 'Features & Improvements');
    }

    if (nodes[2].type === 'heading') {
      assert.equal(nodes[2].level, 3);
      assert.ok(nodes[2].inlines.some((t) => t.type === 'bold' && t.value === 'Breaking'));
    }
  });

  test('parses unordered, ordered, and task list items', () => {
    const md = `
* Feature 1: Added TLS support
* Feature 2: Added protobuf decoding
- [x] Completed task item
- [ ] Incomplete task item
1. First step
2. Second step
`;

    const nodes = parseMarkdown(md);
    assert.equal(nodes.length, 2);

    // First list: unordered with tasks
    assert.equal(nodes[0].type, 'list');
    if (nodes[0].type === 'list') {
      assert.equal(nodes[0].ordered, false);
      assert.equal(nodes[0].items.length, 4);
      assert.equal(nodes[0].items[2].checked, true);
      assert.equal(nodes[0].items[3].checked, false);
    }

    // Second list: ordered
    assert.equal(nodes[1].type, 'list');
    if (nodes[1].type === 'list') {
      assert.equal(nodes[1].ordered, true);
      assert.equal(nodes[1].items.length, 2);
    }
  });

  test('parses fenced code blocks with language and content', () => {
    const md = `
\`\`\`rust
fn main() {
    println!("Hello Zenoh!");
}
\`\`\`
`;

    const nodes = parseMarkdown(md);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, 'code_block');
    if (nodes[0].type === 'code_block') {
      assert.equal(nodes[0].language, 'rust');
      assert.ok(nodes[0].code.includes('fn main()'));
      assert.ok(nodes[0].code.includes('println!("Hello Zenoh!");'));
    }
  });

  test('parses blockquotes, horizontal rules, and paragraphs', () => {
    const md = `
> Important note: Please backup your configuration before updating.

---

Here is a regular paragraph explaining the update.
`;

    const nodes = parseMarkdown(md);
    assert.equal(nodes.length, 3);
    assert.equal(nodes[0].type, 'blockquote');
    assert.equal(nodes[1].type, 'thematic_break');
    assert.equal(nodes[2].type, 'paragraph');
  });

  test('parses markdown tables with headers and row cells', () => {
    const md = `
| Component | Status | Details |
|---|---|---|
| Router | Active | Port 7447 |
| Peer | Connected | Direct P2P |
`;

    const nodes = parseMarkdown(md);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, 'table');
    if (nodes[0].type === 'table') {
      assert.equal(nodes[0].headers.length, 3);
      assert.equal(nodes[0].rows.length, 2);
      assert.equal(nodes[0].rows[0].length, 3);
    }
  });

  test('parses inline formatting: bold, italic, inline code, strikethrough, links, badges', () => {
    const text = 'This is **bold**, *italic*, ~~strikethrough~~, `code_snippet`, and [GitHub Link](https://github.com/khanhdew/ZenohX) feat: new feature!';
    const inlines = parseInlineMarkdown(text);

    assert.ok(inlines.some((t) => t.type === 'bold' && t.value === 'bold'));
    assert.ok(inlines.some((t) => t.type === 'italic' && t.value === 'italic'));
    assert.ok(inlines.some((t) => t.type === 'strikethrough' && t.value === 'strikethrough'));
    assert.ok(inlines.some((t) => t.type === 'code' && t.value === 'code_snippet'));
    assert.ok(inlines.some((t) => t.type === 'link' && t.text === 'GitHub Link' && t.href === 'https://github.com/khanhdew/ZenohX'));
    assert.ok(inlines.some((t) => t.type === 'badge' && t.variant === 'feat'));
  });

  test('auto-links bare URLs safely without breaking plain text', () => {
    const text = 'Check out https://zenoh.io for official protocol documentation.';
    const inlines = parseInlineMarkdown(text);

    assert.ok(inlines.some((t) => t.type === 'link' && t.href === 'https://zenoh.io'));
  });
});
