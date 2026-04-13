const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { Marp } = require('@marp-team/marp-core');
const MarkdownIt = require('markdown-it');
const { setupScrollSync } = require('./scroll');

const SMART_BLOCK_TYPES = {
  info: { className: 'info', label: 'Info' },
  note: { className: 'info', label: 'Note' },
  warning: { className: 'warning', label: 'Warning' },
  danger: { className: 'warning', label: 'Danger' },
  tip: { className: 'tip', label: 'Tip' },
  astuce: { className: 'tip', label: 'Astuce' },
  exercise: { className: 'exercise', label: 'Exercise' },
  exercice: { className: 'exercise', label: 'Exercice' },
  solution: { className: 'solution', label: 'Solution' }
};
const inlineMarkdown = new MarkdownIt({ html: true });

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.markdownPreview',
      () => openPreview(context))
  );

  const provider = new TemplateProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('visualizerView', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.copyTemplate', (label, content) => {
      if (!content) return;
      vscode.env.clipboard.writeText(content).then(() => {
        vscode.window.showInformationMessage(`Copié: ${label}`);
      }, err => {
        vscode.window.showErrorMessage('Impossible de copier dans le presse-papiers: ' + err.message);
      });
    })
  );
}

function deactivate() {}

// ---------------------------------------------------------------------------
// Parser de blocs :::
//
// Syntaxe unique (multiligne seulement) :
//
//   ::: titre optionnel      ← ouvre un bloc
//   contenu...
//   ::: enfant               ← bloc imbriqué
//   contenu enfant...
//   :::                      ← ferme le bloc enfant
//   :::                      ← ferme le bloc parent
//
// La règle est simple :
//   - ::: suivi de texte  = ouverture
//   - ::: seul            = fermeture
// ---------------------------------------------------------------------------

function processCustomBlocks(text) {
  const lines = text.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fermeture seule, ne devrait pas arriver ici (consommé dans la récursion)
    // mais on la laisse passer telle quelle si orpheline
    if (trimmed === ':::') {
      output.push(line);
      i++;
      continue;
    }

    // Ouverture : ::: ou ::: titre
    const openMatch = trimmed.match(/^:::\s*(.*)$/);
    if (openMatch) {
      const meta = parseCustomBlockMeta(openMatch[1].trim());
      const innerLines = [];
      i++;
      let depth = 1;

      while (i < lines.length) {
        const inner = lines[i];
        const innerTrimmed = inner.trim();

        if (innerTrimmed === ':::') {
          depth--;
          if (depth === 0) { i++; break; }
          innerLines.push(inner);
        } else if (innerTrimmed.startsWith(':::')) {
          depth++;
          innerLines.push(inner);
        } else {
          innerLines.push(inner);
        }
        i++;
      }

      const rawInnerContent = innerLines.join('\n');
      const renderedContent = meta.isColumns
        ? rawInnerContent
        : processCustomBlocks(rawInnerContent);
      output.push(renderBlockHTML(renderedContent, meta));
      continue;
    }

    output.push(line);
    i++;
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Convertit une couleur #hex ou rgb(r,g,b) en rgba(r,g,b,alpha)
// ---------------------------------------------------------------------------
function hexOrRgbToRgba(color, alpha) {
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }
  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
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

  // Extraire une couleur optionnelle : rgb(r,g,b) ou #rrggbb / #rgb
  // La couleur peut apparaître n'importe où dans le header
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

  const match = remaining.match(/^([^\s]+)(?:\s+(.*))?$/);
  if (!match) {
    return { type: null, title: remaining, isColumns: false, customColor };
  }

  const keyword = match[1].toLowerCase();
  const smartType = SMART_BLOCK_TYPES[keyword];
  if (!smartType) {
    return { type: null, title: remaining, isColumns: false, customColor };
  }

  return {
    type: smartType,
    title: match[2] ? match[2].trim() : smartType.label,
    isColumns: false,
    customColor
  };
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

  // Si une couleur custom est fournie, on l'injecte via des CSS variables inline
  // Elle écrase les couleurs définies par le type (info, warning, etc.)
  let styleAttr = '';
  if (meta.customColor) {
    const bg = hexOrRgbToRgba(meta.customColor, 0.12);
    styleAttr = ` style="--block-accent: ${meta.customColor}; --block-bg: ${bg};"`;
  }

  return `<div class="${blockClass}"${styleAttr}>${titleHtml}<table><tr><td>${content}</td></tr></table></div>`;
}

function parseColumnsMeta(rawHeader) {
  const match = rawHeader.match(/^COL\s*\{([^}]*)\}(?:\s+(.*))?\s*$/i);
  if (!match) {
    return null;
  }

  const specs = match[1]
    .split(',')
    .map(part => part.trim())
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
  const visibleColumns = meta.columns.filter(column => column.ratio > 0).length;
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
        contentIndex++;
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
  const parts = (itemParts.length > 0 ? itemParts : splitColumnsBySeparator(content))
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(part => processCustomBlocks(part));

  return parts;
}

function extractColumnItems(content) {
  const lines = content.split('\n');
  const items = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === '---') {
      i++;
      continue;
    }

    const itemMatch = trimmed.match(/^:::\s*ITEM(?:\s+(.*))?\s*$/i);
    if (!itemMatch) {
      i++;
      continue;
    }

    i++;
    let depth = 1;
    const itemLines = [];

    if (itemMatch[1]) {
      itemLines.push(`### ${itemMatch[1].trim()}`);
    }

    while (i < lines.length) {
      const currentLine = lines[i];
      const currentTrimmed = currentLine.trim();

      if (currentTrimmed === '---') {
        i++;
        continue;
      }

      if (/^:::\s*ITEM(?:\s+.*)?\s*$/i.test(currentTrimmed)) {
        depth++;
        itemLines.push(currentLine);
        i++;
        continue;
      }

      if (startsNestedCustomBlock(currentTrimmed)) {
        depth++;
        itemLines.push(currentLine);
        i++;
        continue;
      }

      if (currentTrimmed === ':::') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
        itemLines.push(currentLine);
        i++;
        continue;
      }

      itemLines.push(currentLine);
      i++;
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
.custom-block table {
  width: 100%;
  border-collapse: collapse;
}
.custom-block td {
  padding: 0.2rem 0;
  vertical-align: top;
}
.custom-block-info {
  --block-accent: #2f80ed;
  --block-bg: rgba(47, 128, 237, 0.12);
}
.custom-block-warning {
  --block-accent: #d97706;
  --block-bg: rgba(217, 119, 6, 0.12);
}
.custom-block-tip {
  --block-accent: #059669;
  --block-bg: rgba(5, 150, 105, 0.12);
}
.custom-block-exercise {
  --block-accent: #7c3aed;
  --block-bg: rgba(124, 58, 237, 0.12);
}
.custom-block-solution {
  --block-accent: #db2777;
  --block-bg: rgba(219, 39, 119, 0.12);
}
.custom-block .custom-block {
  border-color: #f7a26a;
  background: rgba(247, 162, 106, 0.08);
}
.custom-block .custom-block .custom-block-title {
  color: #f7a26a;
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

// ---------------------------------------------------------------------------

function openPreview(context) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Ouvrez un fichier Markdown (.md)');
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'mdMarpMermaidPreview',
    'Marp + Mermaid Preview',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  const nonce = getNonce();

  function update() {
    const text = editor.document.getText();
    panel.webview.html = renderWithMarp(text, nonce);
  }

  update();

  const changeListener = vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document === editor.document) update();
  });

  const scrollListener = setupScrollSync(editor, panel);

  panel.onDidDispose(() => {
    changeListener.dispose();
    scrollListener.dispose();
  });
}

function renderWithMarp(markdown, nonce) {
  const marp = new Marp({
    html: true,
    math: 'katex'
  });

  const preprocessed = processCustomBlocks(markdown);
  const { html, css } = marp.render(preprocessed);

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">

<meta http-equiv="Content-Security-Policy"
content="
default-src 'none';
style-src 'unsafe-inline' https://cdn.jsdelivr.net;
script-src 'nonce-${nonce}' https://cdn.jsdelivr.net 'unsafe-eval';
font-src https://cdn.jsdelivr.net;
img-src https://cdn.jsdelivr.net data:;
">

<style>
${css}

${customBlockCSS}

section {
  overflow: visible;
}
.mermaid {
  width: 100%;
}
.mermaid svg {
  overflow: visible;
  max-width: 100%;
}
body {
  background: #1e1e1e;
  color: #ddd;
  padding: 1.5rem;
  font-family: system-ui, sans-serif;
}
html {
  scroll-behavior: smooth;
}
</style>

<link rel="stylesheet"
href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
</head>

<body>
${html}

<script nonce="${nonce}"
src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>

<script nonce="${nonce}"
src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>

<script nonce="${nonce}" type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

const vscode = acquireVsCodeApi();

mermaid.initialize({ startOnLoad: false, theme: "default" });

async function renderMermaids() {
  const codes = document.querySelectorAll('pre > code.language-mermaid');
  for (const code of codes) {
    const pre = code.parentElement;
    try {
      const renderId = 'mermaid-svg-' + Math.random().toString(36).substr(2, 9);
      const result = await mermaid.render(renderId, code.textContent);
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.innerHTML = result.svg;
      pre.replaceWith(div);
    } catch (err) {
      console.error('Erreur Mermaid:', err);
      pre.textContent = 'Erreur de rendu Mermaid';
    }
  }
}

renderMermaids();

renderMathInElement(document.body, {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false }
  ]
});

window.addEventListener('message', event => {
  const { type, ratio } = event.data;
  if (type === 'scroll') {
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    window.scrollTo({ top: scrollHeight * ratio, behavior: 'auto' });
  }
});
</script>

</body>
</html>`;
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars[Math.floor(Math.random() * chars.length)];
  return nonce;
}

class TemplateProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.templates = this._loadTemplates();
  }

  _loadTemplates() {
    try {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) return {};
      const filePath = path.join(folders[0].uri.fsPath, 'templates.json');
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  getChildren(element) {
    if (!element) {
      return Object.keys(this.templates || {}).map(cat => ({ type: 'category', label: cat }));
    }
    if (element.type === 'category') {
      const items = this.templates[element.label] || {};
      return Object.keys(items).map(k => ({ type: 'template', label: k, content: items[k] }));
    }
    return [];
  }

  getTreeItem(element) {
    if (element.type === 'category') {
      return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
    }
    const ti = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    ti.tooltip = element.content;
    ti.command = {
      command: 'visualizer.copyTemplate',
      title: 'Copier',
      arguments: [element.label, element.content]
    };
    return ti;
  }

  refresh() {
    this.templates = this._loadTemplates();
    this._onDidChangeTreeData.fire();
  }
}

module.exports = { activate, deactivate };