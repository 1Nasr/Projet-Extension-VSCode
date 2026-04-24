const vscode = require('vscode');
const {
  TemplateProvider,
  addNewCategory,
  copyTemplate,
  createNewTemplate,
  deleteCategory,
  deleteTemplate,
  editTemplate,
  initializeTemplatesFile,
  openPreviewSettings
} = require('./templates');
const { openPreview, exportActiveEditorToPdf, preparerNavigateurPdf } = require('./preview');

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
    }),
    vscode.commands.registerCommand('visualizer.exportPdf', () => exportActiveEditorToPdf(context))
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
  preparerNavigateurPdf(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
