const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

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

module.exports = {
  TemplateProvider,
  addNewCategory,
  copyTemplate,
  createNewTemplate,
  deleteCategory,
  deleteTemplate,
  editTemplate,
  getTemplatesPath,
  initializeTemplatesFile,
  openPreviewSettings
};
