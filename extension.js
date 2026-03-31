const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { Marp } = require('@marp-team/marp-core');
const { setupScrollSync } = require('./scroll');

// Initialiser templates.json avec les templates par défaut
function initializeTemplatesFile() {
  try {
    const templatesPath = path.join(__dirname, 'templates.json');
    
    // Si le fichier n'existe pas, le créer avec les templates par défaut
    if (!fs.existsSync(templatesPath)) {
      const defaultTemplates = {
        "Mermaid": {
          "Test Utilisateur": "flowchart TD\n    A[📱 Utilisateur] -->|Clique| B{Quelle action?}\n    B -->|Créer| C[✏️ Nouveau Template]\n    B -->|Éditer| D[🔧 Modifier]\n    B -->|Supprimer| E[🗑️ Effacer]\n    C --> F[✅ Sauvegardé]\n    D --> F\n    E --> F\n    F --> G[📄 templates.json mis à jour]",
          "Classe": "classDiagram\n    Animal <|-- Duck\n    Animal <|-- Fish\n    Animal <|-- Zebra\n    Animal : +int age\n    Animal : +String gender\n    Animal: +isMammal()\n    Animal: +mate()\n    class Duck{\n      +String beakColor\n      +swim()\n      +quack()\n    }\n    class Fish{\n      -int sizeInFeet\n      -canEat()\n    }\n    class Zebra{\n      +bool is_wild\n      +run()\n    }",
          "Diagramme de séquence": "sequenceDiagram\n    Alice->>+John: Hello John, how are you?\n    Alice->>+John: John, can you hear me?\n    John-->>-Alice: Hi Alice, I can hear you!\n    John-->>-Alice: I feel great!",
          "Diagramme de flux": "flowchart LR\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Do something]\n    B -->|No| D[Do something else]"
        }
      };
      
      fs.writeFileSync(templatesPath, JSON.stringify(defaultTemplates, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Erreur lors de l\'initialisation de templates.json:', e);
  }
}

function activate(context) {
  // Initialiser templates.json au démarrage
  initializeTemplatesFile();
  // Initialiser templates.json au démarrage
  initializeTemplatesFile();
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.markdownPreview',
      () => openPreview(context))
  );

  const provider = new TemplateProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('visualizerView', provider)
  );
  provider.refresh();
  provider.refresh();

  // Commande: copier template
  // Commande: copier template
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

  // Commande: créer un nouveau template
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.createTemplate', () => {
      createNewTemplate(provider);
    })
  );

  // Commande: éditer un template existant
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.editTemplate', (item) => {
      if (item && item.type === 'template') {
        editTemplate(provider, item.categoryLabel, item.label);
      }
    })
  );

  // Commande: supprimer un template
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.deleteTemplate', (item) => {
      if (item && item.type === 'template') {
        deleteTemplate(provider, item.categoryLabel, item.label);
      }
    })
  );

  // Commande: ajouter une catégorie
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.addCategory', () => {
      addNewCategory(provider);
    })
  );

  // Commande: supprimer une catégorie
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.deleteCategory', (item) => {
      if (item && item.type === 'category') {
        deleteCategory(provider, item.label);
      }
    })
  );

  // File watcher pour rafraîchir automatiquement
  const templateWatcher = vscode.workspace.createFileSystemWatcher('**/templates.json');
  templateWatcher.onDidChange(() => {
    setTimeout(() => provider.refresh(), 500);
  });
  templateWatcher.onDidCreate(() => provider.refresh());
  templateWatcher.onDidDelete(() => {
    initializeTemplatesFile();
    provider.refresh();
  });
  context.subscriptions.push(templateWatcher);

  // Commande: créer un nouveau template
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.createTemplate', () => {
      createNewTemplate(provider);
    })
  );

  // Commande: éditer un template existant
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.editTemplate', (item) => {
      if (item && item.type === 'template') {
        editTemplate(provider, item.categoryLabel, item.label);
      }
    })
  );

  // Commande: supprimer un template
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.deleteTemplate', (item) => {
      if (item && item.type === 'template') {
        deleteTemplate(provider, item.categoryLabel, item.label);
      }
    })
  );

  // Commande: ajouter une catégorie
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.addCategory', () => {
      addNewCategory(provider);
    })
  );

  // Commande: supprimer une catégorie
  context.subscriptions.push(
    vscode.commands.registerCommand('visualizer.deleteCategory', (item) => {
      if (item && item.type === 'category') {
        deleteCategory(provider, item.label);
      }
    })
  );

  // File watcher pour rafraîchir automatiquement
  const templateWatcher = vscode.workspace.createFileSystemWatcher('**/templates.json');
  templateWatcher.onDidChange(() => {
    setTimeout(() => provider.refresh(), 500);
  });
  templateWatcher.onDidCreate(() => provider.refresh());
  templateWatcher.onDidDelete(() => {
    initializeTemplatesFile();
    provider.refresh();
  });
  context.subscriptions.push(templateWatcher);
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

mermaid.initialize({
  startOnLoad: false,
  theme: "default"
});

// on passe par un svg car html directement marp rogne tout
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
    
    // On retire le 'smooth' ici car le CSS (scroll-behavior) s'en occupe déjà 
    // de façon plus optimisée. Si tu préfères le contrôler en JS, garde 'smooth'.
    window.scrollTo({
      top: scrollHeight * ratio,
      behavior: 'auto' 
    });
  }
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

// Ajouter une nouvelle catégorie
async function addNewCategory(provider) {
  const categoryName = await vscode.window.showInputBox({
    prompt: 'Nom de la nouvelle catégorie',
    placeHolder: 'ex: API, Database, Frontend...'
  });
  
  if (!categoryName) return;
  
  if (provider.addCategory(categoryName)) {
    vscode.window.showInformationMessage(`Catégorie "${categoryName}" créée avec succès`);
    provider.refresh();
  }
}

// Créer un nouveau template
async function createNewTemplate(provider) {
  const categories = Object.keys(provider.templates);
  if (categories.length === 0) {
    vscode.window.showErrorMessage('Aucune catégorie disponible. Créez une catégorie d\'abord.');
    return;
  }

  const category = await vscode.window.showQuickPick(categories, {
    placeHolder: 'Sélectionnez une catégorie'
  });
  
  if (!category) return;

  const templateName = await vscode.window.showInputBox({
    prompt: 'Nom du template',
    placeHolder: 'ex: Diagram, Component...'
  });
  
  if (!templateName) return;

  if (provider.templates[category][templateName]) {
    vscode.window.showErrorMessage(`"${templateName}" existe déjà dans cette catégorie`);
    return;
  }

  const templateContent = await vscode.window.showInputBox({
    prompt: 'Contenu du template',
    placeHolder: 'Collez le contenu du template...',
    ignoreFocusOut: true
  });
  
  if (!templateContent) return;

  if (provider.addTemplate(category, templateName, templateContent)) {
    vscode.window.showInformationMessage(`Template "${templateName}" créé avec succès`);
    provider.refresh();
  }
}

// Éditer un template existant
async function editTemplate(provider, categoryName, templateName) {
  const currentContent = provider.templates[categoryName][templateName];
  
  const newContent = await vscode.window.showInputBox({
    prompt: `Éditer le template "${templateName}"`,
    value: currentContent,
    ignoreFocusOut: true
  });
  
  if (newContent !== undefined && newContent !== currentContent) {
    if (provider.updateTemplate(categoryName, templateName, newContent)) {
      vscode.window.showInformationMessage(`Template "${templateName}" modifié avec succès`);
      provider.refresh();
    }
  }
}

// Supprimer un template
async function deleteTemplate(provider, categoryName, templateName) {
  const confirmation = await vscode.window.showWarningMessage(
    `Êtes-vous sûr de vouloir supprimer "${templateName}"?`,
    'Supprimer',
    'Annuler'
  );
  
  if (confirmation === 'Supprimer') {
    if (provider.deleteTemplate(categoryName, templateName)) {
      vscode.window.showInformationMessage(`Template "${templateName}" supprimé`);
      provider.refresh();
    }
  }
}

// Supprimer une catégorie
async function deleteCategory(provider, categoryName) {
  const templateCount = Object.keys(provider.templates[categoryName] || {}).length;
  const confirmation = await vscode.window.showWarningMessage(
    `Supprimer la catégorie "${categoryName}" et ses ${templateCount} template(s) ?`,
    'Supprimer',
    'Annuler'
  );

  if (confirmation === 'Supprimer') {
    if (provider.deleteCategory(categoryName)) {
      vscode.window.showInformationMessage(`Catégorie "${categoryName}" supprimée`);
      provider.refresh();
    }
  }
}


// Ajouter une nouvelle catégorie
async function addNewCategory(provider) {
  const categoryName = await vscode.window.showInputBox({
    prompt: 'Nom de la nouvelle catégorie',
    placeHolder: 'ex: API, Database, Frontend...'
  });
  
  if (!categoryName) return;
  
  if (provider.addCategory(categoryName)) {
    vscode.window.showInformationMessage(`Catégorie "${categoryName}" créée avec succès`);
    provider.refresh();
  }
}

// Créer un nouveau template
async function createNewTemplate(provider) {
  const categories = Object.keys(provider.templates);
  if (categories.length === 0) {
    vscode.window.showErrorMessage('Aucune catégorie disponible. Créez une catégorie d\'abord.');
    return;
  }

  const category = await vscode.window.showQuickPick(categories, {
    placeHolder: 'Sélectionnez une catégorie'
  });
  
  if (!category) return;

  const templateName = await vscode.window.showInputBox({
    prompt: 'Nom du template',
    placeHolder: 'ex: Diagram, Component...'
  });
  
  if (!templateName) return;

  if (provider.templates[category][templateName]) {
    vscode.window.showErrorMessage(`"${templateName}" existe déjà dans cette catégorie`);
    return;
  }

  const templateContent = await vscode.window.showInputBox({
    prompt: 'Contenu du template',
    placeHolder: 'Collez le contenu du template...',
    ignoreFocusOut: true
  });
  
  if (!templateContent) return;

  if (provider.addTemplate(category, templateName, templateContent)) {
    vscode.window.showInformationMessage(`Template "${templateName}" créé avec succès`);
    provider.refresh();
  }
}

// Éditer un template existant
async function editTemplate(provider, categoryName, templateName) {
  const currentContent = provider.templates[categoryName][templateName];
  
  const newContent = await vscode.window.showInputBox({
    prompt: `Éditer le template "${templateName}"`,
    value: currentContent,
    ignoreFocusOut: true
  });
  
  if (newContent !== undefined && newContent !== currentContent) {
    if (provider.updateTemplate(categoryName, templateName, newContent)) {
      vscode.window.showInformationMessage(`Template "${templateName}" modifié avec succès`);
      provider.refresh();
    }
  }
}

// Supprimer un template
async function deleteTemplate(provider, categoryName, templateName) {
  const confirmation = await vscode.window.showWarningMessage(
    `Êtes-vous sûr de vouloir supprimer "${templateName}"?`,
    'Supprimer',
    'Annuler'
  );
  
  if (confirmation === 'Supprimer') {
    if (provider.deleteTemplate(categoryName, templateName)) {
      vscode.window.showInformationMessage(`Template "${templateName}" supprimé`);
      provider.refresh();
    }
  }
}

// Supprimer une catégorie
async function deleteCategory(provider, categoryName) {
  const templateCount = Object.keys(provider.templates[categoryName] || {}).length;
  const confirmation = await vscode.window.showWarningMessage(
    `Supprimer la catégorie "${categoryName}" et ses ${templateCount} template(s) ?`,
    'Supprimer',
    'Annuler'
  );

  if (confirmation === 'Supprimer') {
    if (provider.deleteCategory(categoryName)) {
      vscode.window.showInformationMessage(`Catégorie "${categoryName}" supprimée`);
      provider.refresh();
    }
  }
}

// template d'arbre pour parser templates.json vers l'arborescence de la vue 
class TemplateProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.templatesFilePath = this._getTemplatesPath();
    this.templatesFilePath = this._getTemplatesPath();
    this.templates = this._loadTemplates();
  }

  _getTemplatesPath() {
    return path.join(__dirname, 'templates.json');
  }

  _loadTemplates() {
    try {
      if (!this.templatesFilePath) return {};
      const raw = fs.readFileSync(this.templatesFilePath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  _saveTemplates() {
    try {
      if (!this.templatesFilePath) return false;
      fs.writeFileSync(this.templatesFilePath, JSON.stringify(this.templates, null, 2), 'utf8');
      return true;
    } catch (e) {
      vscode.window.showErrorMessage(`Erreur lors de la sauvegarde: ${e.message}`);
      return false;
    }
  }

  getChildren(element) {
    if (!element) {
      // Recharge a chaque ouverture de la racine pour refleter templates.json.
      this.templates = this._loadTemplates();
      return Object.keys(this.templates || {})
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(cat => ({ type: 'category', label: cat }));
      // Recharge a chaque ouverture de la racine pour refleter templates.json.
      this.templates = this._loadTemplates();
      return Object.keys(this.templates || {})
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(cat => ({ type: 'category', label: cat }));
    }
    if (element.type === 'category') {
      const items = this.templates[element.label] || {};
      return Object.keys(items)
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(k => ({ 
        type: 'template', 
        label: k, 
        content: items[k], 
        categoryLabel: element.label 
      }));
      return Object.keys(items)
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(k => ({ 
        type: 'template', 
        label: k, 
        content: items[k], 
        categoryLabel: element.label 
      }));
    }
    return [];
  }

  getTreeItem(element) {
    if (element.type === 'category') {
      const ti = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      ti.contextValue = 'category';
      return ti;
      const ti = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      ti.contextValue = 'category';
      return ti;
    }
    const ti = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    ti.tooltip = element.content;
    ti.contextValue = 'template';
    ti.contextValue = 'template';
    ti.command = {
      command: 'visualizer.copyTemplate',
      title: 'Copier',
      arguments: [element.label, element.content]
    };
    ti.iconPath = new vscode.ThemeIcon('file-text');
    ti.iconPath = new vscode.ThemeIcon('file-text');
    return ti;
  }

  refresh() {
    this.templates = this._loadTemplates();
    this._onDidChangeTreeData.fire();
  }

  addCategory(categoryName) {
    if (!categoryName || categoryName.trim() === '') return false;
    if (this.templates[categoryName]) {
      vscode.window.showErrorMessage(`La catégorie "${categoryName}" existe déjà`);
      return false;
    }
    this.templates[categoryName] = {};
    return this._saveTemplates();
  }

  addTemplate(categoryName, templateName, content) {
    if (!this.templates[categoryName]) {
      vscode.window.showErrorMessage(`La catégorie "${categoryName}" n'existe pas`);
      return false;
    }
    if (!templateName || templateName.trim() === '') return false;
    this.templates[categoryName][templateName] = content;
    return this._saveTemplates();
  }

  updateTemplate(categoryName, templateName, newContent) {
    if (!this.templates[categoryName] || !this.templates[categoryName][templateName]) {
      return false;
    }
    this.templates[categoryName][templateName] = newContent;
    return this._saveTemplates();
  }

  deleteTemplate(categoryName, templateName) {
    if (!this.templates[categoryName] || !this.templates[categoryName][templateName]) {
      return false;
    }
    delete this.templates[categoryName][templateName];
    return this._saveTemplates();
  }

  deleteCategory(categoryName) {
    if (!this.templates[categoryName]) {
      return false;
    }
    delete this.templates[categoryName];
    return this._saveTemplates();
  }

  renameTemplate(categoryName, oldName, newName) {
    if (!this.templates[categoryName] || !this.templates[categoryName][oldName]) {
      return false;
    }
    const content = this.templates[categoryName][oldName];
    delete this.templates[categoryName][oldName];
    this.templates[categoryName][newName] = content;
    return this._saveTemplates();
  }

  addCategory(categoryName) {
    if (!categoryName || categoryName.trim() === '') return false;
    if (this.templates[categoryName]) {
      vscode.window.showErrorMessage(`La catégorie "${categoryName}" existe déjà`);
      return false;
    }
    this.templates[categoryName] = {};
    return this._saveTemplates();
  }

  addTemplate(categoryName, templateName, content) {
    if (!this.templates[categoryName]) {
      vscode.window.showErrorMessage(`La catégorie "${categoryName}" n'existe pas`);
      return false;
    }
    if (!templateName || templateName.trim() === '') return false;
    this.templates[categoryName][templateName] = content;
    return this._saveTemplates();
  }

  updateTemplate(categoryName, templateName, newContent) {
    if (!this.templates[categoryName] || !this.templates[categoryName][templateName]) {
      return false;
    }
    this.templates[categoryName][templateName] = newContent;
    return this._saveTemplates();
  }

  deleteTemplate(categoryName, templateName) {
    if (!this.templates[categoryName] || !this.templates[categoryName][templateName]) {
      return false;
    }
    delete this.templates[categoryName][templateName];
    return this._saveTemplates();
  }

  deleteCategory(categoryName) {
    if (!this.templates[categoryName]) {
      return false;
    }
    delete this.templates[categoryName];
    return this._saveTemplates();
  }

  renameTemplate(categoryName, oldName, newName) {
    if (!this.templates[categoryName] || !this.templates[categoryName][oldName]) {
      return false;
    }
    const content = this.templates[categoryName][oldName];
    delete this.templates[categoryName][oldName];
    this.templates[categoryName][newName] = content;
    return this._saveTemplates();
  }
}

module.exports = { activate, deactivate };
