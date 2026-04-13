const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Marp } = require('@marp-team/marp-core');
const MarkdownIt = require('markdown-it');
const { setupScrollSync } = require('./scroll');

function getTemplatesPath() {
  return path.join(__dirname, 'templates.json');
}

function initializeTemplatesFile() {
  try {
    const templatesPath = getTemplatesPath();
    if (fs.existsSync(templatesPath)) return;

    const defaultTemplates = {
      Mermaid: {
        'Test Utilisateur': 'flowchart TD\n    A[Utilisateur] -->|Clique| B{Quelle action?}\n    B -->|Creer| C[Nouveau Template]\n    B -->|Editer| D[Modifier]\n    B -->|Supprimer| E[Effacer]\n    C --> F[Sauvegarde]\n    D --> F\n    E --> F\n    F --> G[templates.json mis a jour]',
        Classe: 'classDiagram\n    Animal <|-- Duck\n    Animal <|-- Fish\n    Animal <|-- Zebra\n    Animal : +int age\n    Animal : +String gender\n    Animal: +isMammal()\n    Animal: +mate()\n    class Duck{\n      +String beakColor\n      +swim()\n      +quack()\n    }\n    class Fish{\n      -int sizeInFeet\n      -canEat()\n    }\n    class Zebra{\n      +bool is_wild\n      +run()\n    }',
        'Diagramme de sequence': 'sequenceDiagram\n    Alice->>+John: Hello John, how are you?\n    Alice->>+John: John, can you hear me?\n    John-->>-Alice: Hi Alice, I can hear you!\n    John-->>-Alice: I feel great!'
      }
    };

    fs.writeFileSync(templatesPath, JSON.stringify(defaultTemplates, null, 2), 'utf8');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de templates.json:', error);
  }
}

function activate(context) {
  initializeTemplatesFile();

  const provider = new TemplateProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('visualizerView', provider),
    vscode.commands.registerCommand('visualizer.markdownPreview', () => openPreview(context)),
    vscode.commands.registerCommand('visualizer.openPreviewSettings', openPreviewSettings),
    vscode.commands.registerCommand('visualizer.copyTemplate', (label, content) => copyTemplate(label, content)),
    vscode.commands.registerCommand('visualizer.createTemplate', () => createNewTemplate(provider)),
    vscode.commands.registerCommand('visualizer.editTemplate', (item) => {
      if (item && item.type === 'template') {
        editTemplate(provider, item.categoryLabel, item.label);
      }
    }),
    vscode.commands.registerCommand('visualizer.deleteTemplate', (item) => {
      if (item && item.type === 'template') {
        deleteTemplate(provider, item.categoryLabel, item.label);
      }
    }),
    vscode.commands.registerCommand('visualizer.addCategory', () => addNewCategory(provider)),
    vscode.commands.registerCommand('visualizer.deleteCategory', (item) => {
      if (item && item.type === 'category') {
        deleteCategory(provider, item.label);
      }
    }),
    vscode.commands.registerCommand('visualizer.exportPdf', () => exportActiveEditorToPdf())
  );

  const templateWatcher = vscode.workspace.createFileSystemWatcher('**/templates.json');
  templateWatcher.onDidChange(() => setTimeout(() => provider.refresh(), 200));
  templateWatcher.onDidCreate(() => provider.refresh());
  templateWatcher.onDidDelete(() => {
    initializeTemplatesFile();
    provider.refresh();
  });

  context.subscriptions.push(templateWatcher);
  provider.refresh();
}

function deactivate() {}

function copyTemplate(label, content) {
  if (!content) return;
  vscode.env.clipboard.writeText(content).then(
    () => vscode.window.showInformationMessage(`Copie: ${label}`),
    (err) => vscode.window.showErrorMessage(`Impossible de copier: ${err.message}`)
  );
}

function openPreviewSettings() {
  vscode.commands.executeCommand('workbench.action.openSettings', 'visualizer.preview');
}

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
  const sourceDocument = editor.document;

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message?.type === 'exportPdf') {
      try {
        await exportMarkdownToPdf(sourceDocument.getText());
      } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage('Echec de l\'export PDF.');
      }
    }
  });

  function update() {
    const text = editor.document.getText();
    const settings = getPreviewSettings();
    panel.webview.html = renderWithMarp(text, nonce, settings);
  }

  function subscribeToDocumentChanges(mode) {
    if (mode === 'onSave') {
      return vscode.workspace.onDidSaveTextDocument((document) => {
        if (document === editor.document) update();
      });
    }

    return vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === editor.document) update();
    });
  }

  update();

  let changeListener = subscribeToDocumentChanges(getPreviewSettings().updateMode);

  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('visualizer.preview')) {
      if (event.affectsConfiguration('visualizer.preview.updateMode')) {
        changeListener.dispose();
        changeListener = subscribeToDocumentChanges(getPreviewSettings().updateMode);
      }
      update();
    }
  });

  const scrollListener = setupScrollSync(editor, panel);

  panel.onDidDispose(() => {
    changeListener.dispose();
    configListener.dispose();
    scrollListener.dispose();
  });
}

function renderWithMarp(markdown, nonce, settings) {
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
  font-size: ${settings.fontSize}px !important;
}
section p,
section li,
section blockquote,
section pre,
section code {
  font-size: ${settings.fontSize}px;
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
  font-size: ${settings.fontSize}px;
}
html {
  scroll-behavior: smooth;
}
.toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
    gap: 0.5rem;
  justify-content: flex-end;
  margin-bottom: 1rem;
}
.reading-progress-track {
  position: sticky;
  top: 0;
  z-index: 11;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  margin-bottom: 0.75rem;
}
.reading-progress-bar {
  width: 0%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #31c48d 0%, #2f9cf4 100%);
  transition: width 0.08s linear;
}
.top-button,
.export-button {
  background: #0e639c;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.top-button:hover,
.export-button:hover {
  background: #1177bb;
}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
</head>
<body>
<div class="reading-progress-track" aria-hidden="true">
  <div class="reading-progress-bar" id="readingProgressBar"></div>
</div>
<div class="toolbar">
  <button class="top-button" id="boutonAllerEnHaut">Aller en haut</button>
  <button class="export-button" id="exportPdf">Exporter en PDF</button>
</div>
${html}
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script nonce="${nonce}" type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

const vscode = acquireVsCodeApi();
const boutonAllerEnHaut = document.getElementById('boutonAllerEnHaut');
const exportButton = document.getElementById('exportPdf');
const readingProgressBar = document.getElementById('readingProgressBar');
if (boutonAllerEnHaut) {
  boutonAllerEnHaut.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    vscode.postMessage({ type: 'previewScroll', ratio: 0 });
    updateReadingProgress();
  });
}

if (exportButton) {
  exportButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'exportPdf' });
  });
}

function updateReadingProgress() {
  if (!readingProgressBar) return;
  const doc = document.documentElement;
  const scrollableHeight = doc.scrollHeight - doc.clientHeight;
  if (scrollableHeight <= 0) {
    readingProgressBar.style.width = '100%';
    return;
  }

  const ratio = Math.max(0, Math.min(1, window.scrollY / scrollableHeight));
  readingProgressBar.style.width = String(ratio * 100) + '%';
}

mermaid.initialize({ startOnLoad: false, theme: ${JSON.stringify(settings.mermaidTheme)} });

async function renderMermaids() {
  const codes = Array.from(document.querySelectorAll('code')).filter((code) => {
    if (code.classList.contains('language-mermaid')) return true;
    const dataLang = code.getAttribute('data-lang') || code.getAttribute('data-language');
    return dataLang === 'mermaid';
  });

  for (const code of codes) {
    const pre = code.parentElement;
    try {
      const renderId = 'mermaid-svg-' + Math.random().toString(36).slice(2, 11);
      const result = await mermaid.render(renderId, code.textContent);
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.innerHTML = result.svg;
      pre.replaceWith(div);
    } catch (error) {
      console.error('Erreur Mermaid:', error);
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

updateReadingProgress();
window.addEventListener('scroll', updateReadingProgress, { passive: true });

window.addEventListener('message', (event) => {
  const { type, ratio } = event.data;
  if (type === 'scroll') {
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    window.scrollTo({ top: scrollHeight * ratio, behavior: 'auto' });
    updateReadingProgress();
  }
});
</script>
</body>
</html>`;
}

function getPreviewSettings() {
  const config = vscode.workspace.getConfiguration('visualizer.preview');
  return {
    mermaidTheme: config.get('mermaidTheme', 'default'),
    updateMode: config.get('updateMode', 'onType'),
    fontSize: Math.max(10, Math.min(40, Number(config.get('fontSize', 16)) || 16))
  };
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += chars[Math.floor(Math.random() * chars.length)];
  }
  return nonce;
}

async function addNewCategory(provider) {
  const categoryName = await vscode.window.showInputBox({
    prompt: 'Nom de la nouvelle categorie',
    placeHolder: 'ex: API, Database, Frontend...'
  });

  if (!categoryName) return;

  if (provider.addCategory(categoryName)) {
    vscode.window.showInformationMessage(`Categorie "${categoryName}" creee avec succes`);
    provider.refresh();
  }
}

async function createNewTemplate(provider) {
  const categories = Object.keys(provider.templates);
  if (categories.length === 0) {
    vscode.window.showErrorMessage('Aucune categorie disponible. Creez une categorie d\'abord.');
    return;
  }

  const category = await vscode.window.showQuickPick(categories, {
    placeHolder: 'Selectionnez une categorie'
  });
  if (!category) return;

  const templateName = await vscode.window.showInputBox({
    prompt: 'Nom du template',
    placeHolder: 'ex: Diagram, Component...'
  });
  if (!templateName) return;

  if (provider.templates[category][templateName]) {
    vscode.window.showErrorMessage(`"${templateName}" existe deja dans cette categorie`);
    return;
  }

  const templateContent = await vscode.window.showInputBox({
    prompt: 'Contenu du template',
    placeHolder: 'Collez le contenu du template...',
    ignoreFocusOut: true
  });
  if (!templateContent) return;

  if (provider.addTemplate(category, templateName, templateContent)) {
    vscode.window.showInformationMessage(`Template "${templateName}" cree avec succes`);
    provider.refresh();
  }
}

async function editTemplate(provider, categoryName, templateName) {
  const currentContent = provider.templates[categoryName][templateName];

  const newContent = await vscode.window.showInputBox({
    prompt: `Editer le template "${templateName}"`,
    value: currentContent,
    ignoreFocusOut: true
  });

  if (newContent !== undefined && newContent !== currentContent) {
    if (provider.updateTemplate(categoryName, templateName, newContent)) {
      vscode.window.showInformationMessage(`Template "${templateName}" modifie avec succes`);
      provider.refresh();
    }
  }
}

async function deleteTemplate(provider, categoryName, templateName) {
  const confirmation = await vscode.window.showWarningMessage(
    `Etes-vous sur de vouloir supprimer "${templateName}" ?`,
    'Supprimer',
    'Annuler'
  );

  if (confirmation === 'Supprimer') {
    if (provider.deleteTemplate(categoryName, templateName)) {
      vscode.window.showInformationMessage(`Template "${templateName}" supprime`);
      provider.refresh();
    }
  }
}

async function deleteCategory(provider, categoryName) {
  const templateCount = Object.keys(provider.templates[categoryName] || {}).length;
  const confirmation = await vscode.window.showWarningMessage(
    `Supprimer la categorie "${categoryName}" et ses ${templateCount} template(s) ?`,
    'Supprimer',
    'Annuler'
  );

  if (confirmation === 'Supprimer') {
    if (provider.deleteCategory(categoryName)) {
      vscode.window.showInformationMessage(`Categorie "${categoryName}" supprimee`);
      provider.refresh();
    }
  }
}

class TemplateProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.templatesFilePath = getTemplatesPath();
    this.templates = this._loadTemplates();
  }

  _loadTemplates() {
    try {
      const raw = fs.readFileSync(this.templatesFilePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      return {};
    }
  }

  _saveTemplates() {
    try {
      fs.writeFileSync(this.templatesFilePath, JSON.stringify(this.templates, null, 2), 'utf8');
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`Erreur lors de la sauvegarde: ${error.message}`);
      return false;
    }
  }

  getChildren(element) {
    if (!element) {
      this.templates = this._loadTemplates();
      return Object.keys(this.templates)
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map((category) => ({ type: 'category', label: category }));
    }

    if (element.type === 'category') {
      const items = this.templates[element.label] || {};
      return Object.keys(items)
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map((name) => ({
          type: 'template',
          label: name,
          content: items[name],
          categoryLabel: element.label
        }));
    }

    return [];
  }

  getTreeItem(element) {
    if (element.type === 'category') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'category';
      return item;
    }

    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'template';
    item.tooltip = element.content;
    item.iconPath = new vscode.ThemeIcon('file-text');
    item.command = {
      command: 'visualizer.copyTemplate',
      title: 'Copier',
      arguments: [element.label, element.content]
    };
    return item;
  }

  refresh() {
    this.templates = this._loadTemplates();
    this._onDidChangeTreeData.fire();
  }

  addCategory(categoryName) {
    if (!categoryName || categoryName.trim() === '') return false;
    if (this.templates[categoryName]) {
      vscode.window.showErrorMessage(`La categorie "${categoryName}" existe deja`);
      return false;
    }

    this.templates[categoryName] = {};
    return this._saveTemplates();
  }

  addTemplate(categoryName, templateName, content) {
    if (!this.templates[categoryName]) {
      vscode.window.showErrorMessage(`La categorie "${categoryName}" n'existe pas`);
      return false;
    }
    if (!templateName || templateName.trim() === '') return false;

    this.templates[categoryName][templateName] = content;
    return this._saveTemplates();
  }

  updateTemplate(categoryName, templateName, newContent) {
    if (!this.templates[categoryName] || !this.templates[categoryName][templateName]) return false;

    this.templates[categoryName][templateName] = newContent;
    return this._saveTemplates();
  }

  deleteTemplate(categoryName, templateName) {
    if (!this.templates[categoryName] || !this.templates[categoryName][templateName]) return false;

    delete this.templates[categoryName][templateName];
    return this._saveTemplates();
  }

  deleteCategory(categoryName) {
    if (!this.templates[categoryName]) return false;

    delete this.templates[categoryName];
    return this._saveTemplates();
  }
}

async function exportActiveEditorToPdf() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Ouvrez un fichier Markdown (.md)');
    return;
  }

  await exportMarkdownToPdf(editor.document.getText());
}

function buildExportHtml(markdown, assets) {
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
<style>
${css}
${customBlockCSS}
body {
  background: #ffffff;
  color: #111111;
  padding: 24px;
  font-family: system-ui, sans-serif;
}
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
</style>
<link rel="stylesheet" href="${assets.katexCss}">
</head>
<body>
${html}
<script src="${assets.katexJs}"></script>
<script src="${assets.katexAutoRenderJs}"></script>
<script src="${assets.mermaidUmd}"></script>
<script>
async function waitForMermaid() {
  const start = Date.now();
  while (!window.mermaid) {
    if (Date.now() - start > 5000) {
      throw new Error('Mermaid non charge');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return window.mermaid;
}

async function renderMermaids(mermaid) {
  const codes = Array.from(document.querySelectorAll('code')).filter((code) => {
    if (code.classList.contains('language-mermaid')) return true;
    const dataLang = code.getAttribute('data-lang') || code.getAttribute('data-language');
    return dataLang === 'mermaid';
  });

  for (const code of codes) {
    const pre = code.parentElement;
    try {
      const renderId = 'mermaid-svg-' + Math.random().toString(36).slice(2, 11);
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

async function prepareExport() {
  try {
    const mermaid = await waitForMermaid();
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose'
    });

    await renderMermaids(mermaid);

    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ]
    });
  } catch (err) {
    console.error('Preparation export:', err);
    window.__exportError = err?.message || String(err);
  } finally {
    window.__exportReady = true;
  }
}

window.addEventListener('load', prepareExport);
</script>
</body>
</html>`;
}

async function exportMarkdownToPdf(markdown) {
  const defaultName = 'export.pdf';
  const targetUri = await vscode.window.showSaveDialog({
    saveLabel: 'Enregistrer le PDF',
    filters: { PDF: ['pdf'] },
    defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
  });

  if (!targetUri) return;

  const assets = getLocalAssetUrls();
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'md-export-'));
  const tempHtmlPath = path.join(tempDir, 'index.html');
  const html = buildExportHtml(markdown, assets);
  await fs.promises.writeFile(tempHtmlPath, html, 'utf8');

  let browser;
  let puppeteer;

  try {
    try {
      puppeteer = require('puppeteer');
    } catch (err) {
      vscode.window.showErrorMessage('Puppeteer non installe. Lance "npm install" puis reessaie.');
      return;
    }

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--allow-file-access-from-files',
        '--disable-web-security'
      ]
    });

    const page = await browser.newPage();
    await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__exportReady === true', { timeout: 15000 });
    const exportError = await page.evaluate(() => window.__exportError || null);
    if (exportError) {
      throw new Error(exportError);
    }

    await page.pdf({
      path: targetUri.fsPath,
      format: 'A4',
      printBackground: true
    });

    vscode.window.showInformationMessage(`PDF exporte: ${targetUri.fsPath}`);
  } catch (error) {
    console.error(error);
    vscode.window.showErrorMessage('Echec de l\'export PDF. Verifie les logs.');
  } finally {
    if (browser) {
      await browser.close();
    }
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function getLocalAssetUrls() {
  const toFileUrl = (filePath) => vscode.Uri.file(filePath).toString();
  const root = path.resolve(__dirname);

  return {
    katexCss: toFileUrl(path.join(root, 'node_modules/katex/dist/katex.min.css')),
    katexJs: toFileUrl(path.join(root, 'node_modules/katex/dist/katex.min.js')),
    katexAutoRenderJs: toFileUrl(path.join(root, 'node_modules/katex/dist/contrib/auto-render.min.js')),
    mermaidUmd: toFileUrl(path.join(root, 'node_modules/mermaid/dist/mermaid.min.js'))
  };
}

module.exports = { activate, deactivate };