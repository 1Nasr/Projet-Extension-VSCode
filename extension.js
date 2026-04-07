const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { Marp } = require('@marp-team/marp-core');
const { setupScrollSync } = require('./scroll');
const path = require('path');
const fs = require('fs');
const os = require('os');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.markdownPreview',
      () => openPreview(context))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.exportPdf',
      () => exportActiveEditorToPdf())
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

    // Fermeture seule — ne devrait pas arriver ici (consommé dans la récursion)
    // mais on la laisse passer telle quelle si orpheline
    if (trimmed === ':::') {
      output.push(line);
      i++;
      continue;
    }

    // Ouverture : ::: ou ::: titre
    const openMatch = trimmed.match(/^:::\s*(.*)$/);
    if (openMatch) {
      const title = openMatch[1].trim();
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

      const innerProcessed = processCustomBlocks(innerLines.join('\n'));
      output.push(renderBlockHTML(innerProcessed, title));
      continue;
    }

    output.push(line);
    i++;
  }

  return output.join('\n');
}

function renderBlockHTML(content, title) {
  const titleHtml = title
    ? `<div class="custom-block-title">${title}</div>`
    : '';
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
        vscode.window.showErrorMessage('Échec de l’export PDF.');
      }
    }
  });

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

function renderWithMarp(markdown, nonce) { //genere le HTML de la preview et ajoute le bouton 
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

<link rel="stylesheet"
href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
</head>

<body>
<div class="toolbar">
  <button class="export-button" id="exportPdf">Exporter en PDF</button>
</div>
${html}

<script nonce="${nonce}"
src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>

<script nonce="${nonce}"
src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>

<script nonce="${nonce}" type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

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
