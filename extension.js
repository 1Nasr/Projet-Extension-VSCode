const vscode = require('vscode');
const { Marp } = require('@marp-team/marp-core');
const { setupScrollSync } = require('./scroll');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.markdownPreview',
      () => openPreview(context))
  );
}

function deactivate() {}

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
    {
      enableScripts: true
    }
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
  panel.webview.onDidReceiveMessage(async message => {
    if (message.type === 'export-pdf') {
      await exportPdf(editor.document.getText(), context);
    }
  });
  panel.onDidDispose(() => {
    changeListener.dispose();
    scrollListener.dispose();
  });
}

async function exportPdf(markdown, context) {
  const uri = await vscode.window.showSaveDialog({
    filters: { PDF: ['pdf'] },
    defaultUri: vscode.Uri.file('export.pdf')
  });
  if (!uri) return;

  const nonce = getNonce();
  const html = renderWithMarp(markdown, nonce);

  const tmpHtml = path.join(context.extensionPath, '__export.html');
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`file://${tmpHtml}`, {
    waitUntil: 'networkidle'
  });
 
  await page.waitForTimeout(500);

  await page.pdf({
    path: uri.fsPath,
    format: 'A4',
    printBackground: true
  });

  await browser.close();
  fs.unlinkSync(tmpHtml);

  vscode.window.showInformationMessage('PDF exporté 🎉');
}
function renderWithMarp(markdown, nonce) {
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
 
#exportPdf {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 1000;
  padding: 8px 16px;
  background: #0e639c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.2s;
}

#exportPdf:hover {
  background: #1177bb;
}

@media print {
  #exportPdf { display: none; }
  body { background: white; color: black; }
}
</style>

<link rel="stylesheet"
href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
</head>

<body>
<button id="exportPdf">Exporter PDF</button>

${html}

<script nonce="${nonce}"
src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>

<script nonce="${nonce}"
src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>

<script nonce="${nonce}" type="module"> 
  let vscode = null;
  
  try { 
    if (typeof acquireVsCodeApi === 'function') {
        vscode = acquireVsCodeApi();
    }
  } catch (e) {
    console.log('Mode export ou hors VS Code');
  }
 
  mermaid.initialize({
    startOnLoad: false,
    theme: "default"
  });

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
 
  const btn = document.getElementById('exportPdf');
  if (btn) { 
    if (!vscode) {
        // btn.style.display = 'none'; 
    } else {
        btn.addEventListener('click', () => {
            vscode.postMessage({ type: 'export-pdf' });
        });
    }
  }
</script>

</body>
</html>`;
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars[Math.floor(Math.random() * chars.length)];
  }
  return nonce;
}

module.exports = { activate, deactivate };
