const vscode = require('vscode');

function setupScrollSync(editor, panel) {
  const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges(e => {
    if (e.textEditor !== editor) return;
  
    const document = editor.document;
    
    const LOOK_AHEAD = 15; 
    const firstVisibleLine = e.visibleRanges[0].start.line;
    const targetLine = Math.min(firstVisibleLine + LOOK_AHEAD, document.lineCount - 1);
    if (firstVisibleLine === 0) {
        panel.webview.postMessage({ type: 'scroll', ratio: 0 });
        return;
      }
    const NORMAL_WEIGHT = 20;
    const SLIDE_BOOST = 800; 
    let weightedCurrent = 0;
    let weightedTotal = 0;
    let separatorCount = 0;
    let inCodeBlock = false;
  
    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text.trim();
  
      //poids de scroll de chaque ligne "normale"
      let weight = NORMAL_WEIGHT;
      //evite que l'entete fasse n'importe quoi avec les ---
      if (lineText.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }
      if (!inCodeBlock && lineText === '---') {
        separatorCount++;
        if (separatorCount > 2) {
          weight = SLIDE_BOOST;
        }
      }
  
      weightedTotal += weight;
      if (i <= targetLine) {
        weightedCurrent += weight;
      }
    }
  
    const smartRatio = weightedCurrent / weightedTotal;
  
    panel.webview.postMessage({
      type: 'scroll',
      ratio: smartRatio
    });
  });

  return scrollListener;
}

module.exports = {
  setupScrollSync
};