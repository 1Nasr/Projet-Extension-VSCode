const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { Marp } = require('@marp-team/marp-core');
const { setupScrollSync } = require('./scroll');

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
