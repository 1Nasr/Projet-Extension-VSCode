const vscode = require('vscode');

function configurerSynchroDefilement(editeur, panneau) {
  const INTERVALLE_MIN_ENVOI_MS = 50;
  const INTERVALLE_MIN_APERCU_MS = 50;
  const FENETRE_BLOCAGE_CODE_VERS_APERCU_MS = 180;
  const SEUIL_VARIATION_RATIO = 0.003;
  const SEUIL_VARIATION_LIGNE = 8;

  let dernierEnvoiMs = 0;
  let dernierRatioEnvoye = -1;
  let derniereLigneApercuAppliquee = -1;
  let dernierPilotageApercuMs = 0;
  let ignorerCodeVersApercuJusquaMs = 0;

  let poidsCumules = [];
  let poidsTotal = 1;

  function recalculerPoidsDocument(document) {
    const NORMAL_WEIGHT = 20;
    const SLIDE_BOOST = 800;
    let separateurCount = 0;
    let dansBlocCode = false;
    let total = 0;
    const cumules = new Array(document.lineCount);

    for (let i = 0; i < document.lineCount; i += 1) {
      const texteLigne = document.lineAt(i).text.trim();
      let poids = NORMAL_WEIGHT;

      if (texteLigne.startsWith('```')) {
        dansBlocCode = !dansBlocCode;
      }
      if (!dansBlocCode && texteLigne === '---') {
        separateurCount += 1;
        if (separateurCount > 2) {
          poids = SLIDE_BOOST;
        }
      }

      total += poids;
      cumules[i] = total;
    }

    poidsCumules = cumules;
    poidsTotal = Math.max(1, total);
  }

  function obtenirRatioIntelligent(ligneCible) {
    if (poidsCumules.length === 0) return 0;
    const index = Math.max(0, Math.min(ligneCible, poidsCumules.length - 1));
    return poidsCumules[index] / poidsTotal;
  }

  recalculerPoidsDocument(editeur.document);

  const ecouteurDefilementCode = vscode.window.onDidChangeTextEditorVisibleRanges(e => {
    if (e.textEditor !== editeur) return;

    const maintenantMs = Date.now();
    if (maintenantMs < ignorerCodeVersApercuJusquaMs) {
      return;
    }

    const document = editeur.document;

    const LOOK_AHEAD = 15;
    const firstVisibleLine = e.visibleRanges[0].start.line;
    const ligneCible = Math.min(firstVisibleLine + LOOK_AHEAD, document.lineCount - 1);

    if (firstVisibleLine === 0) {
      if (dernierRatioEnvoye !== 0) {
        panneau.webview.postMessage({ type: 'scroll', ratio: 0 });
        dernierRatioEnvoye = 0;
      }
      return;
    }

    const ratioIntelligent = obtenirRatioIntelligent(ligneCible);
    const variationRatio = Math.abs(ratioIntelligent - dernierRatioEnvoye);
    if (
      maintenantMs - dernierEnvoiMs < INTERVALLE_MIN_ENVOI_MS
      && variationRatio < SEUIL_VARIATION_RATIO
    ) {
      return;
    }

    panneau.webview.postMessage({
      type: 'scroll',
      ratio: ratioIntelligent
    });

    dernierEnvoiMs = maintenantMs;
    dernierRatioEnvoye = ratioIntelligent;
  });

  const ecouteurDocument = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document === editeur.document) {
      recalculerPoidsDocument(editeur.document);
    }
  });

  const ecouteurDefilementApercu = panneau.webview.onDidReceiveMessage((message) => {
    if (message?.type !== 'previewScroll') return;

    const maintenantMs = Date.now();
    if (maintenantMs - dernierPilotageApercuMs < INTERVALLE_MIN_APERCU_MS) {
      return;
    }

    const ratio = Math.max(0, Math.min(1, Number(message.ratio) || 0));
    const ligneCible = Math.round((editeur.document.lineCount - 1) * ratio);

    if (Math.abs(ligneCible - derniereLigneApercuAppliquee) < SEUIL_VARIATION_LIGNE) {
      return;
    }

    const ligneVisible = editeur.visibleRanges?.[0]?.start?.line ?? 0;
    if (Math.abs(ligneCible - ligneVisible) < SEUIL_VARIATION_LIGNE) {
      return;
    }

    editeur.revealRange(
      new vscode.Range(ligneCible, 0, ligneCible, 0),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );

    ignorerCodeVersApercuJusquaMs = maintenantMs + FENETRE_BLOCAGE_CODE_VERS_APERCU_MS;
    dernierPilotageApercuMs = maintenantMs;
    derniereLigneApercuAppliquee = ligneCible;
  });

  return vscode.Disposable.from(ecouteurDefilementCode, ecouteurDocument, ecouteurDefilementApercu);
}

module.exports = {
  configurerSynchroDefilement
};