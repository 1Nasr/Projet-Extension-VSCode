const fs = require('fs');
const path = require('path');
const {
  Browser,
  computeExecutablePath,
  detectBrowserPlatform,
  install
} = require('@puppeteer/browsers');
const { PUPPETEER_REVISIONS } = require('puppeteer-core/internal/revisions.js');

const dossierNavigateurs = path.resolve(__dirname, '..', 'navigateurs-embarques');
const identifiantVersion = PUPPETEER_REVISIONS.chrome;

async function principal() {
  const plateforme = detectBrowserPlatform();
  if (!plateforme) {
    throw new Error('Plateforme non supportee pour le telechargement de Chrome.');
  }

  const cheminExecutable = computeExecutablePath({
    cacheDir: dossierNavigateurs,
    browser: Browser.CHROME,
    buildId: identifiantVersion,
    platform: plateforme
  });

  if (fs.existsSync(cheminExecutable)) {
    console.log(`Chrome est deja disponible : ${cheminExecutable}`);
    return;
  }

  console.log(`Installation de Chrome ${identifiantVersion} pour ${plateforme}...`);
  await install({
    cacheDir: dossierNavigateurs,
    browser: Browser.CHROME,
    buildId: identifiantVersion,
    platform: plateforme
  });

  console.log(`Navigateur installe dans ${dossierNavigateurs}`);
}

principal().catch((erreur) => {
  console.error(erreur);
  process.exitCode = 1;
});
