const MarkdownIt = require('markdown-it');

const inlineMarkdown = new MarkdownIt({ html: true });

function processCustomBlocks(text) {
  const lines = text.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === ':::') {
      output.push(line);
      i += 1;
      continue;
    }

    const openMatch = trimmed.match(/^:::\s*(.*)$/);
    if (openMatch) {
      const meta = parseCustomBlockMeta(openMatch[1].trim());
      const innerLines = [];
      i += 1;
      let depth = 1;

      while (i < lines.length) {
        const inner = lines[i];
        const innerTrimmed = inner.trim();

        if (innerTrimmed === ':::') {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
          innerLines.push(inner);
        } else if (innerTrimmed.startsWith(':::')) {
          depth += 1;
          innerLines.push(inner);
        } else {
          innerLines.push(inner);
        }

        i += 1;
      }

      const rawInnerContent = innerLines.join('\n');
      const renderedContent = meta.isColumns
        ? rawInnerContent
        : processCustomBlocks(rawInnerContent);
      output.push(renderBlockHTML(renderedContent, meta));
      continue;
    }

    output.push(line);
    i += 1;
  }

  return output.join('\n');
}

function hexOrRgbToRgba(color, alpha) {
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }

  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseCustomBlockMeta(rawHeader) {
  if (!rawHeader) {
    return { type: null, title: '', isColumns: false, customColor: null };
  }

  const columnMeta = parseColumnsMeta(rawHeader);
  if (columnMeta) {
    return columnMeta;
  }

  let customColor = null;
  let remaining = rawHeader;

  const rgbMatch = remaining.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/);
  const hexMatch = remaining.match(/#[0-9a-fA-F]{3,6}\b/);

  if (rgbMatch) {
    customColor = rgbMatch[0];
    remaining = remaining.replace(rgbMatch[0], '').replace(/\s+/g, ' ').trim();
  } else if (hexMatch) {
    customColor = hexMatch[0];
    remaining = remaining.replace(hexMatch[0], '').replace(/\s+/g, ' ').trim();
  }

  return { type: null, title: remaining, isColumns: false, customColor };
}

function renderBlockHTML(content, meta) {
  if (meta.isColumns) {
    return renderColumnsHTML(content, meta);
  }

  const blockClass = meta.type
    ? `custom-block custom-block-${meta.type.className}`
    : 'custom-block';
  const titleHtml = meta.title
    ? `<div class="custom-block-title">${meta.title}</div>`
    : '';

  let styleAttr = '';
  if (meta.customColor) {
    const bg = hexOrRgbToRgba(meta.customColor, 0.12);
    styleAttr = ` style="--block-accent: ${meta.customColor}; --block-bg: ${bg};"`;
  }

  return `<div class="${blockClass}"${styleAttr}>${titleHtml}<div class="custom-block-content">${content}</div></div>`;
}

function parseColumnsMeta(rawHeader) {
  const match = rawHeader.match(/^COL\s*\{([^}]*)\}(?:\s+(.*))?\s*$/i);
  if (!match) {
    return null;
  }

  const specs = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseColumnSpec)
    .filter(Boolean);

  if (specs.length === 0) {
    return null;
  }

  return {
    type: null,
    title: match[2] ? match[2].trim() : '',
    isColumns: true,
    columns: specs
  };
}

function parseColumnSpec(spec) {
  const match = spec.match(/^([clr])\s*(\d+)$/i);
  if (!match) {
    return null;
  }

  return {
    align: normalizeColumnAlignment(match[1]),
    ratio: Number.parseInt(match[2], 10)
  };
}

function normalizeColumnAlignment(rawAlignment) {
  const key = rawAlignment.toLowerCase();
  if (key === 'c') return 'center';
  if (key === 'r') return 'right';
  return 'left';
}

function renderColumnsHTML(content, meta) {
  const rawColumns = extractColumnsContent(content);
  const totalRatio = meta.columns.reduce((sum, column) => sum + Math.max(column.ratio, 0), 0);
  const safeTotalRatio = totalRatio > 0 ? totalRatio : meta.columns.length;
  const titleHtml = meta.title
    ? `<div class="custom-columns-title">${meta.title}</div>`
    : '';
  const visibleColumns = meta.columns.filter((column) => column.ratio > 0).length;
  const useVisibleMapping = rawColumns.length === visibleColumns;
  let contentIndex = 0;

  const columnsHtml = meta.columns.map((column, index) => {
    const safeRatio = totalRatio > 0 ? Math.max(column.ratio, 0) : 1;
    const width = `${(safeRatio / safeTotalRatio) * 100}%`;
    const hiddenClass = safeRatio === 0 ? ' custom-columns-item-hidden' : '';
    let rawColumnContent = '';

    if (safeRatio > 0) {
      if (useVisibleMapping) {
        rawColumnContent = rawColumns[contentIndex] || '';
        contentIndex += 1;
      } else {
        rawColumnContent = rawColumns[index] || '';
      }
    }

    const columnContent = inlineMarkdown.render(rawColumnContent);
    return `<div class="custom-columns-item custom-columns-align-${column.align}${hiddenClass}" style="flex:${safeRatio} 1 0; max-width:${width};">${columnContent}</div>`;
  }).join('');

  return `<div class="custom-columns-wrapper">${titleHtml}<div class="custom-columns">${columnsHtml}</div></div>`;
}

function extractColumnsContent(content) {
  const itemParts = extractColumnItems(content);
  return (itemParts.length > 0 ? itemParts : splitColumnsBySeparator(content))
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => processCustomBlocks(part));
}

function extractColumnItems(content) {
  const lines = content.split('\n');
  const items = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === '---') {
      i += 1;
      continue;
    }

    const itemMatch = trimmed.match(/^:::\s*ITEM(?:\s+(.*))?\s*$/i);
    if (!itemMatch) {
      i += 1;
      continue;
    }

    i += 1;
    let depth = 1;
    const itemLines = [];

    if (itemMatch[1]) {
      itemLines.push(`### ${itemMatch[1].trim()}`);
    }

    while (i < lines.length) {
      const currentLine = lines[i];
      const currentTrimmed = currentLine.trim();

      if (currentTrimmed === '---') {
        i += 1;
        continue;
      }

      if (/^:::\s*ITEM(?:\s+.*)?\s*$/i.test(currentTrimmed)) {
        depth += 1;
        itemLines.push(currentLine);
        i += 1;
        continue;
      }

      if (startsNestedCustomBlock(currentTrimmed)) {
        depth += 1;
        itemLines.push(currentLine);
        i += 1;
        continue;
      }

      if (currentTrimmed === ':::') {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
        itemLines.push(currentLine);
        i += 1;
        continue;
      }

      itemLines.push(currentLine);
      i += 1;
    }

    items.push(itemLines.join('\n'));
  }

  return items;
}

function startsNestedCustomBlock(trimmedLine) {
  if (!trimmedLine.startsWith(':::')) {
    return false;
  }

  if (/^:::\s*ITEM(?:\s+.*)?\s*$/i.test(trimmedLine)) {
    return false;
  }

  return trimmedLine !== ':::';
}

function splitColumnsBySeparator(content) {
  return content.split(/^\s*\|\|\|\s*$/m);
}

const customBlockCSS = `
.custom-block {
  border: 2px solid var(--block-accent, #7c6af7);
  border-radius: 10px;
  padding: 0.65rem 0.8rem;
  margin: 0.75rem 0;
  background: var(--block-bg, rgba(124, 106, 247, 0.08));
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
}
.custom-block-title {
  font-weight: bold;
  color: var(--block-accent, #7c6af7);
  margin-bottom: 0.4rem;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.custom-block-content {
  padding: 0.2rem 0;
}
.custom-block-content > :first-child {
  margin-top: 0;
}
.custom-block-content > :last-child {
  margin-bottom: 0;
}
.custom-block-content p,
.custom-block-content ul,
.custom-block-content ol,
.custom-block-content li,
.custom-block-content blockquote,
.custom-block-content pre,
.custom-block-content code,
.custom-block-content strong,
.custom-block-content em {
  background: transparent !important;
}
.custom-columns {
  display: flex;
  gap: 1rem;
  align-items: stretch;
  margin: 0.75rem 0;
}
.custom-columns-title {
  margin-bottom: 0.5rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5f55d8;
}
.custom-columns-item {
  min-width: 0;
  padding: 0.75rem 0.9rem;
  border: 1px dashed rgba(124, 106, 247, 0.35);
  border-radius: 10px;
  background: rgba(124, 106, 247, 0.05);
}
.custom-columns-item-hidden {
  display: none;
}
.custom-columns-item > :first-child {
  margin-top: 0;
}
.custom-columns-item > :last-child {
  margin-bottom: 0;
}
.custom-columns-align-left {
  text-align: left;
}
.custom-columns-align-center {
  text-align: center;
}
.custom-columns-align-right {
  text-align: right;
}
@media (max-width: 800px) {
  .custom-columns {
    flex-direction: column;
  }
  .custom-columns-item {
    max-width: 100% !important;
  }
}
`;

module.exports = {
  customBlockCSS,
  processCustomBlocks
};
