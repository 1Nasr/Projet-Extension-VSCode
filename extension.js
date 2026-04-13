const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Marp } = require('@marp-team/marp-core');
const { configurerSynchroDefilement } = require('./scroll');

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

    if (trimmed === ':::') {
      output.push(line);
      i += 1;
      continue;
    }

    const openMatch = trimmed.match(/^:::\s*(.*)$/);
    if (openMatch) {
      const title = openMatch[1].trim();
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

      const innerProcessed = processCustomBlocks(innerLines.join('\n'));
      output.push(renderBlockHTML(innerProcessed, title));
      continue;
    }

    output.push(line);
    i += 1;
  }

  return output.join('\n');
}

function renderBlockHTML(content, title) {
  const titleHtml = title ? `<div class="custom-block-title">${title}</div>` : '';
  return `<div class="custom-block">${titleHtml}<table><tr><td>${content}</td></tr></table></div>`;
}

const customBlockCSS = `
.custom-block {
  border: 2px solid #7c6af7;
  border-radius: 8px;
  padding: 0.5rem;
  margin: 0.5rem 0;
  background: rgba(124, 106, 247, 0.08);
}
.custom-block-title {
  font-weight: bold;
  color: #7c6af7;
  margin-bottom: 0.4rem;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.custom-block table {
  width: 100%;
  border-collapse: collapse;
}
.custom-block td {
  padding: 0.4rem;
  vertical-align: top;
}
.custom-block .custom-block {
  border-color: #f7a26a;
  background: rgba(247, 162, 106, 0.08);
}
.custom-block .custom-block .custom-block-title {
  color: #f7a26a;
}
`;

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

  const scrollListener = configurerSynchroDefilement(editor, panel);

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
const boutonExporter = document.getElementById('exportPdf');
const barreProgressionLecture = document.getElementById('readingProgressBar');
let ignorerProchainEvenementDefilementApercu = false;
let dernierEnvoiApercuMs = 0;
let dernierRatioApercuEnvoye = -1;
if (boutonAllerEnHaut) {
  boutonAllerEnHaut.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    vscode.postMessage({ type: 'previewScroll', ratio: 0 });
    mettreAJourProgressionLecture();
  });
}

if (boutonExporter) {
  boutonExporter.addEventListener('click', () => {
    vscode.postMessage({ type: 'exportPdf' });
  });
}

function mettreAJourProgressionLecture() {
  if (!barreProgressionLecture) return;
  const doc = document.documentElement;
  const scrollableHeight = doc.scrollHeight - doc.clientHeight;
  if (scrollableHeight <= 0) {
    barreProgressionLecture.style.width = '100%';
    return;
  }

  const ratio = Math.max(0, Math.min(1, window.scrollY / scrollableHeight));
  barreProgressionLecture.style.width = String(ratio * 100) + '%';
}

function synchroniserEditeurDepuisDefilementApercu() {
  if (ignorerProchainEvenementDefilementApercu) return;

  const doc = document.documentElement;
  const scrollableHeight = doc.scrollHeight - doc.clientHeight;
  const ratio = scrollableHeight <= 0
    ? 0
    : Math.max(0, Math.min(1, window.scrollY / scrollableHeight));

  const maintenantMs = Date.now();
  const variationRatio = Math.abs(ratio - dernierRatioApercuEnvoye);
  if (maintenantMs - dernierEnvoiApercuMs < 33 && variationRatio < 0.004) {
    return;
  }

  vscode.postMessage({ type: 'previewScroll', ratio });
  dernierEnvoiApercuMs = maintenantMs;
  dernierRatioApercuEnvoye = ratio;
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

mettreAJourProgressionLecture();
window.addEventListener('scroll', () => {
  mettreAJourProgressionLecture();
  synchroniserEditeurDepuisDefilementApercu();
}, { passive: true });

window.addEventListener('message', (event) => {
  const { type, ratio } = event.data;
  if (type === 'scroll') {
    ignorerProchainEvenementDefilementApercu = true;
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    window.scrollTo({ top: scrollHeight * ratio, behavior: 'auto' });
    requestAnimationFrame(() => {
      ignorerProchainEvenementDefilementApercu = false;
    });
    mettreAJourProgressionLecture();
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
