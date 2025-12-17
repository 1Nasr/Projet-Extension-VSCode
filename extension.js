const vscode = require('vscode');

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
    'Markdown + LaTeX + Mermaid',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const nonce = getNonce();

  function update() {
    const text = editor.document.getText();
    panel.webview.html = getHtml(text, nonce);
  }

  update();

  
  const saveListener = vscode.workspace.onDidSaveTextDocument(doc => {
    if (doc === editor.document) {
      update();
    }
  });

  panel.onDidDispose(() => saveListener.dispose());
}

function getHtml(markdown, nonce) {
  //echapement obligatoire pour les src
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
    content="
      default-src 'none';
      style-src https://cdn.jsdelivr.net 'unsafe-inline';
      script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
      font-src https://cdn.jsdelivr.net;
      img-src https://cdn.jsdelivr.net data:;
    ">

  <!-- KaTeX -->
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">

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

<!-- Markdown -->
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

<!-- LaTeX -->
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>

<!-- Mermaid -->
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

<script nonce="${nonce}">
  const markdown = \`${escaped}\`;
  const output = document.getElementById('output');

  // Markdown to HTML
  output.innerHTML = marked.parse(markdown);

  // LaTeX
  renderMathInElement(output, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false }
    ]
  });

  //  Mermaid
  mermaid.initialize({
  startOnLoad: false,
  theme: 'dark'
});

output.querySelectorAll('pre code.language-mermaid').forEach((block, i) => {
  const parent = block.parentElement; // le <pre>
  const graphDef = block.textContent;

  const container = document.createElement('div');
  container.className = 'mermaid';
  container.textContent = graphDef;

  parent.replaceWith(container);
});

mermaid.init(undefined, output.querySelectorAll('.mermaid'));
</script>

</body>
</html>
`;
}

function getNonce() {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars[Math.floor(Math.random() * chars.length)];
  }
  return nonce;
}

function deactivate() {}

module.exports = { activate, deactivate };
