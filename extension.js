const vscode = require('vscode');
const { Marp } = require('@marp-team/marp-core');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'latex-visualizer.markdownPreview',
      () => openPreview(context)
    )
  );
}

function openPreview(context) {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Ouvrez d’abord un fichier Markdown (.md)');
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'mdLatexMermaidPreview',
    'Markdown / Marp Preview',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const nonce = getNonce();

  function update() {
    const text = editor.document.getText();

    if (isMarpDocument(text)) {
      panel.webview.html = renderWithMarp(text);
    } else {
      panel.webview.html = getHtml(text, nonce);
    }
  }

  update();

  const saveListener = vscode.workspace.onDidSaveTextDocument(doc => {
    if (doc === editor.document) update();
  });

  panel.onDidDispose(() => saveListener.dispose());
}

// ─────────────────────────────────────────────────────────────
// Marp
// ─────────────────────────────────────────────────────────────

function isMarpDocument(markdown) {
  return (
    markdown.includes('<!-- marp: true -->') ||
    markdown.split('\n').some(l => l.trim() === '---')
  );
}

function renderWithMarp(markdown) {
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
body { background: #1e1e1e; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// Markdown + LaTeX + Mermaid
// ─────────────────────────────────────────────────────────────

function getHtml(markdown, nonce) {
  const escaped = markdown
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">

<meta http-equiv="Content-Security-Policy"
content="default-src 'none';
style-src https://cdn.jsdelivr.net 'unsafe-inline';
script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
font-src https://cdn.jsdelivr.net;
img-src https://cdn.jsdelivr.net data:;">

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">

<style>
body {
  font-family: system-ui, sans-serif;
  padding: 1.5rem;
  background: #1e1e1e;
  color: #ddd;
}
pre {
  background: #252526;
  padding: 1rem;
  overflow-x: auto;
}
</style>
</head>
<body>

<div id="output"></div>

<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

<script nonce="${nonce}">
const markdown = \`${escaped}\`;
const output = document.getElementById('output');

output.innerHTML = marked.parse(markdown);

renderMathInElement(output, {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false }
  ]
});

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

output.querySelectorAll('pre code.language-mermaid').forEach(block => {
  const container = document.createElement('div');
  container.className = 'mermaid';
  container.textContent = block.textContent;
  block.parentElement.replaceWith(container);
});

mermaid.init(undefined, output.querySelectorAll('.mermaid'));
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

function deactivate() {}

module.exports = { activate, deactivate };
