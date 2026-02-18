// customBlockParser.js
// Reconnaissance et rendu des blocs ::: imbriquables

/**
 * Parse les blocs ::: dans un texte markdown
 * Supporte l'imbrication
 * Exemple : ::: bonjour ::: => bloc avec "bonjour"
 *           ::: titre\n contenu\n ::: => bloc multiligne
 */

function parseCustomBlocks(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const inlineMatch = line.match(/^:::\s+(.+?)\s+:::$/);

    if (inlineMatch) {
      // Bloc inline sur une seule ligne ::: contenu :::
      result.push({
        type: 'customBlock',
        content: inlineMatch[1],
        children: [],
        inline: true
      });
      i++;
    } else if (line.trim().startsWith(':::') && !line.trim().startsWith('::: ') || line.trim() === ':::') {
      // Ligne d'ouverture seule (:::) ou avec un titre (::: titre)
      const titleMatch = line.match(/^:::\s*(.*)$/);
      const title = titleMatch ? titleMatch[1].trim() : '';
      const innerLines = [];
      i++;

      // Collecte le contenu jusqu'au ::: fermant (supporte imbrication)
      let depth = 1;
      while (i < lines.length && depth > 0) {
        const inner = lines[i];
        if (inner.trim().startsWith(':::') && !inner.trim().endsWith(':::')) depth++;
        if (inner.trim() === ':::' && depth > 1) depth--;
        else if (inner.trim() === ':::' && depth === 1) { depth = 0; break; }
        if (depth > 0) innerLines.push(inner);
        i++;
      }
      i++; // saute le ::: fermant

      result.push({
        type: 'customBlock',
        title,
        content: innerLines.join('\n'),
        // Récursion pour les blocs imbriqués
        children: parseCustomBlocks(innerLines.join('\n')),
        inline: false
      });
    } else {
      result.push({ type: 'text', content: line });
      i++;
    }
  }

  return result;
}

/**
 * Convertit un bloc parsé en HTML
 */
function renderBlock(block) {
  if (block.type === 'text') {
    return block.content;
  }

  const inner = block.inline
    ? block.content
    : block.children.length > 0
      ? block.children.map(renderBlock).join('\n')
      : block.content;

  const titleHtml = block.title
    ? `<div class="custom-block-title">${block.title}</div>`
    : '';

  return `<div class="custom-block">
  ${titleHtml}
  <table><tr><td>${inner}</td></tr></table>
</div>`;
}

/**
 * Transforme un document markdown complet,
 * en remplaçant les blocs ::: par du HTML
 */
function processDocument(text) {
  const blocks = parseCustomBlocks(text);
  return blocks.map(renderBlock).join('\n');
}

/**
 * setupCustomBlockSync — à brancher dans extension.js
 * Surveille les changements de document et envoie le HTML des blocs au webview
 */
function setupCustomBlockSync(editor, panel) {
  const update = () => {
    const text = editor.document.getText();
    const html = processDocument(text);
    panel.webview.postMessage({ type: 'updateCustomBlocks', html });
  };

  // Envoi initial
  update();

  const changeListener = require('vscode').workspace.onDidChangeTextDocument(e => {
    if (e.document !== editor.document) return;
    update();
  });

  return changeListener;
}

/**
 * Détecte si une ligne donnée fait partie d'un bloc :::
 * Utile pour le scroll (même logique que pour ---)
 */
function isCustomBlockDelimiter(lineText) {
  const trimmed = lineText.trim();
  return trimmed === ':::' || /^:::\s/.test(trimmed) || /\s:::$/.test(trimmed);
}

module.exports = {
  parseCustomBlocks,
  renderBlock,
  processDocument,
  setupCustomBlockSync,
  isCustomBlockDelimiter
};