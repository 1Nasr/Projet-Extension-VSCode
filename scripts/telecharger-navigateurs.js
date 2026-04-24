const path = require('path');
const {
  Browser,
  BrowserPlatform,
  install
} = require('@puppeteer/browsers');
const { PUPPETEER_REVISIONS } = require('puppeteer-core/internal/revisions.js');

const dossierNavigateurs = path.resolve(__dirname, '..', 'navigateurs-embarques');
const identifiantVersion = PUPPETEER_REVISIONS.chrome;

const plateformes = [
  BrowserPlatform.MAC,
  BrowserPlatform.MAC_ARM,
  BrowserPlatform.WIN32,
  BrowserPlatform.WIN64,
  BrowserPlatform.LINUX,
  BrowserPlatform.LINUX_ARM
];

async function principal() {
  for (const plateforme of plateformes) {
    console.log(`Installation de Chrome ${identifiantVersion} pour ${plateforme}...`);
    await install({
      cacheDir: dossierNavigateurs,
      browser: Browser.CHROME,
      buildId: identifiantVersion,
      platform: plateforme
    });
  }

  console.log(`Navigateurs installes dans ${dossierNavigateurs}`);
}

principal().catch((erreur) => {
  console.error(erreur);
  process.exitCode = 1;
});
