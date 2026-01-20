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

function deactivate() {}
 
function openPreview(context) {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Ouvrez d’abord un fichier Markdown (.md)');
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'mdMarpMermaidPreview',
    'Markdown / Marp / Mermaid Preview',
    vscode.ViewColumn.One,
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

  panel.onDidDispose(() => changeListener.dispose());
} 

function renderWithMarp(markdown, nonce) {
  const marp = new Marp({
    html: true,
    math: 'katex',
    mermaid: true
  });

  const { html, css } = marp.render(markdown);

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net; img-src https://cdn.jsdelivr.net data:;">
<style>
${css}
body { background: #1e1e1e; color: #ddd; padding: 1.5rem; font-family: system-ui, sans-serif; }
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
</head>
<body>
${html}

<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script nonce="${nonce}">
renderMathInElement(document.body, {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false }
  ]
});
 
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
