const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Marp } = require('@marp-team/marp-core');
const { configurerSynchroDefilement } = require('./scroll');
const { customBlockCSS, processCustomBlocks } = require('./customBlocks');

let preparationNavigateurPdfPromise;

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
        await exportMarkdownToPdf(sourceDocument.getText(), context);
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
const TEMPS_BLOCAGE_SCROLL_APERCU_MS = 150;
let ignorerApercuScrollJusquaMs = 0;
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
  if (Date.now() < ignorerApercuScrollJusquaMs) return;

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
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const targetTop = Math.max(0, Math.min(scrollHeight, scrollHeight * ratio));
    const currentTop = window.scrollY || document.documentElement.scrollTop;

    ignorerApercuScrollJusquaMs = Date.now() + TEMPS_BLOCAGE_SCROLL_APERCU_MS;

    if (Math.abs(currentTop - targetTop) > 2) {
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    }

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

async function exportActiveEditorToPdf(context) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Ouvrez un fichier Markdown (.md)');
    return;
  }

  await exportMarkdownToPdf(editor.document.getText(), context);
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
html,
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}
body {
  background: #ffffff;
  color: #111111;
  font-family: system-ui, sans-serif;
}
div.marpit {
  margin: 0;
}
div.marpit > svg[data-marpit-svg] {
  display: block;
  margin: 0 auto;
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
@media print {
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
  }
  div.marpit {
    margin: 0 !important;
    padding: 0 !important;
  }
  div.marpit > svg[data-marpit-svg] {
    display: block;
    margin: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    break-after: page;
    page-break-after: always;
  }
  div.marpit > svg[data-marpit-svg]:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  div.marpit > svg:first-child > foreignObject > section {
    break-before: auto !important;
    page-break-before: auto !important;
  }
  div.marpit > svg:last-child > foreignObject > section {
    break-after: auto !important;
    page-break-after: auto !important;
  }
  .custom-block,
  .custom-block *,
  .custom-columns-item,
  .custom-columns-item * {
    background-image: none !important;
  }
  .custom-block,
  .custom-columns-item {
    box-shadow: none !important;
    filter: none !important;
  }
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
    await new Promise((resolve) => setTimeout(resolve, 50));
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

async function exportMarkdownToPdf(markdown, context) {
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

    const executablePath = await obtenirExecutableNavigateurPdf(context, true);
    browser = await puppeteer.launch({
      executablePath,
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
    vscode.window.showErrorMessage(error?.message || 'Echec de l\'export PDF. Verifie les logs.');
  } finally {
    if (browser) {
      await browser.close();
    }
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function preparerNavigateurPdf(context) {
  if (!preparationNavigateurPdfPromise) {
    preparationNavigateurPdfPromise = obtenirExecutableNavigateurPdf(context, true).catch((error) => {
      console.error(error);
      vscode.window.showWarningMessage(
        'Le navigateur pour l\'export PDF n\'a pas pu etre prepare. L\'export reessaiera au moment de la demande.'
      );
      preparationNavigateurPdfPromise = undefined;
      return null;
    });
  }

  return preparationNavigateurPdfPromise;
}

async function obtenirExecutableNavigateurPdf(context, installerSiNecessaire) {
  const {
    Browser,
    ChromeReleaseChannel,
    computeExecutablePath,
    computeSystemExecutablePath,
    install
  } = require('@puppeteer/browsers');
  const { PUPPETEER_REVISIONS } = require('puppeteer-core/internal/revisions.js');

  const chromeInstalle = obtenirChromeInstalle(Browser, ChromeReleaseChannel, computeSystemExecutablePath);
  if (chromeInstalle) {
    return chromeInstalle;
  }

  const identifiantVersion = PUPPETEER_REVISIONS['chrome-headless-shell'];
  const dossierNavigateurs = context?.globalStorageUri?.fsPath
    ? path.join(context.globalStorageUri.fsPath, 'navigateurs-pdf')
    : path.join(os.homedir(), '.markdown-visualizer', 'navigateurs-pdf');

  const executablePath = computeExecutablePath({
    cacheDir: dossierNavigateurs,
    browser: Browser.CHROMEHEADLESSSHELL,
    buildId: identifiantVersion
  });

  if (fs.existsSync(executablePath)) {
    return executablePath;
  }

  if (!installerSiNecessaire) {
    throw new Error('Navigateur pour l\'export PDF introuvable.');
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Preparation du navigateur pour l\'export PDF',
      cancellable: false
    },
    async () => {
      await install({
        cacheDir: dossierNavigateurs,
        browser: Browser.CHROMEHEADLESSSHELL,
        buildId: identifiantVersion
      });
    }
  );

  if (!fs.existsSync(executablePath)) {
    throw new Error(`Navigateur pour l'export PDF introuvable apres installation: ${executablePath}`);
  }

  return executablePath;
}

function obtenirChromeInstalle(Browser, ChromeReleaseChannel, computeSystemExecutablePath) {
  try {
    const executablePath = computeSystemExecutablePath({
      browser: Browser.CHROME,
      channel: ChromeReleaseChannel.STABLE
    });

    return fs.existsSync(executablePath) ? executablePath : null;
  } catch (error) {
    return null;
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

module.exports = {
  exportActiveEditorToPdf,
  openPreview,
  preparerNavigateurPdf
};
