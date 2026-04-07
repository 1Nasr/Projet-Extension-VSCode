const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { Marp } = require('@marp-team/marp-core');
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

  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.exportPdf',
      () => exportActiveEditorToPdf())
  );

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
    })
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
        vscode.window.showErrorMessage('Échec de l’export PDF.');
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

  const { html, css } = marp.render(markdown);

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
.mermaid { width: 100%; }
.mermaid svg { overflow: visible; max-width: 100%; }
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
  justify-content: flex-end;
  margin-bottom: 1rem;
}
.export-button {
  background: #0e639c;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.export-button:hover {
  background: #1177bb;
}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
</head>
<body>
<div class="toolbar">
  <button class="export-button" id="exportPdf">Exporter en PDF</button>
</div>
${html}
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script nonce="${nonce}" type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

mermaid.initialize({ startOnLoad: false, theme: ${JSON.stringify(settings.mermaidTheme)} });
const vscode = acquireVsCodeApi();
const exportButton = document.getElementById('exportPdf');
if (exportButton) {
  exportButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'exportPdf' });
  });
}

mermaid.initialize({ startOnLoad: false, theme: "default" });

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

window.addEventListener('message', (event) => {
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

async function exportActiveEditorToPdf() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Ouvrez un fichier Markdown (.md)');
    return;
  }

  await exportMarkdownToPdf(editor.document.getText());
}

function buildExportHtml(markdown, assets) { // construit un HTML sans connexion avec les assets locaux depuis node_modules
  const marp = new Marp({
    html: true,
    math: 'katex'
  });

  const { html, css } = marp.render(markdown);

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
${css}
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
      throw new Error('Mermaid non chargé');
    }
    await new Promise(r => setTimeout(r, 50));
  }
  return window.mermaid;
}

// remplacer le code Mermaid par du SVG ->

async function renderMermaids(mermaid) { 
  const codes = Array.from(document.querySelectorAll('code')).filter((code) => {
    if (code.classList.contains('language-mermaid')) return true; // detecte le language mermaid 
    const dataLang = code.getAttribute('data-lang') || code.getAttribute('data-language');
    return dataLang === 'mermaid';
  });
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

async function prepareExport() {
  try {
    const mermaid = await waitForMermaid();
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose"
    });

    await renderMermaids(mermaid);

    //  remplacer KaTeX

    renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false }
      ]
    });
  } catch (err) {
    console.error('Préparation export:', err);
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

async function exportMarkdownToPdf(markdown) { // prepare les chemins locaux des assets (KaTeX/Mermaid) pour l'export pdf.
  const defaultName = 'export.pdf';
  const targetUri = await vscode.window.showSaveDialog({
    saveLabel: 'Enregistrer le PDF',
    filters: { PDF: ['pdf'] },
    defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
  });

  if (!targetUri) {
    return;
  }

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
      vscode.window.showErrorMessage('Puppeteer non installé. Lance "npm install" puis réessaie.');
      return;
    }

    browser = await puppeteer.launch({ //flags Chromium pour autoriser le chargement de fichiers locaux. Mermaid/KaTeX peuvent être bloqués si pas present
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

    vscode.window.showInformationMessage(`PDF exporté : ${targetUri.fsPath}`);
  } catch (error) {
    console.error(error);
    vscode.window.showErrorMessage('Échec de l’export PDF. Vérifie les logs.');
  } finally {
    if (browser) {
      await browser.close();
    }
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function getLocalAssetUrls() { // Construit des url file:// vers les assets installés dans node_modules
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
