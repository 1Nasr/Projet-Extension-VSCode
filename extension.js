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
html { scroll-behavior: smooth; }
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
</head>
<body>
${html}
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script nonce="${nonce}" type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

mermaid.initialize({ startOnLoad: false, theme: ${JSON.stringify(settings.mermaidTheme)} });

async function renderMermaids() {
  const codes = document.querySelectorAll('pre > code.language-mermaid');
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

module.exports = { activate, deactivate };
