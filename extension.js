const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

function activate(context) {

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'latex-visualizer.compilePanel',
      () => compileAndShowPanel()
    )
  );
}

function compileAndShowPanel() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'latex') {
    vscode.window.showErrorMessage('Ouvrez d’abord un fichier .tex');
    return;
  }

  const texPath = editor.document.fileName;
  const dir = path.dirname(texPath);
  const file = path.basename(texPath);

  exec(`pdflatex -interaction=nonstopmode "${file}"`, { cwd: dir }, (error, stdout, stderr) => {
    if (error) {
      vscode.window.showErrorMessage('Compilation LaTeX échouée');
      console.error(stderr);
      return;
    }

    const pdfPath = path.join(dir, file.replace(/\.tex$/, '.pdf'));
    if (!fs.existsSync(pdfPath)) {
      vscode.window.showErrorMessage('Le PDF généré est introuvable');
      return;
    }

    openPdfPanel(pdfPath);
  });
}

function openPdfPanel(pdfPath) {
  const panel = vscode.window.createWebviewPanel(
    'latexPdfPanel',
    'LaTeX PDF Preview',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.dirname(pdfPath))]
    }
  );

  // Transforme le chemin local en URI utilisable dans WebView
  const pdfUri = panel.webview.asWebviewUri(vscode.Uri.file(pdfPath));

  panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PDF Preview</title>
  <style>
    body { margin:0; overflow:auto; background:#333; display:flex; justify-content:center; align-items:center; }
    canvas { display:block; }
  </style>
</head>
<body>
  <canvas id="pdf-canvas"></canvas>
  
  <!-- PDF.js -->
  <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.338/build/pdf.min.js"></script>
  <script>
    const url = "${pdfUri}";

    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.338/build/pdf.worker.min.js";

    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');

    fetch(url)
      .then(res => res.arrayBuffer())
      .then(data => {
        pdfjsLib.getDocument({data}).promise.then(pdf => {
          // Affiche la première page pour commencer
          pdf.getPage(1).then(page => {
            const viewport = page.getViewport({scale:1.5});
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            page.render({canvasContext: ctx, viewport: viewport});
          });
        });
      });
  </script>
</body>
</html>
`;
}

function deactivate() {}

module.exports = { activate, deactivate };
