import fs from 'node:fs';
import path from 'node:path';
import { loc } from './locators.js';

const APP_IDS = { android: 'com.wdiodemoapp', ios: 'org.wdiodemoapp' };
const EVIDENCE_DIR = path.resolve(import.meta.dirname, '../../evidence');

// Avisos do sistema que podem cobrir o app em emuladores lentos (CI): "X isn't responding" → "Wait".
const SYSTEM_DIALOG_BUTTONS = ['android=new UiSelector().textMatches("(?i)wait|aguardar")', 'android=new UiSelector().textMatches("(?i)close app|fechar app")'];

async function dismissSystemDialogs() {
  if (driver.isIOS) return;
  for (const sel of SYSTEM_DIALOG_BUTTONS) {
    // eslint-disable-next-line no-await-in-loop
    const btn = await $(sel);
    // eslint-disable-next-line no-await-in-loop
    if (await btn.isExisting().catch(() => false)) await btn.click().catch(() => {});
  }
}

/** Salva screenshot + page source quando a preparação falha (o afterTest do WDIO não roda em falha de hook). */
async function saveHookEvidence(name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const png = await driver.takeScreenshot().catch(() => null);
  if (png) fs.writeFileSync(path.join(EVIDENCE_DIR, `FAIL__hook__${name}.png`), png, 'base64');
  const xml = await driver.getPageSource().catch(() => null);
  if (xml) fs.writeFileSync(path.join(EVIDENCE_DIR, `FAIL__hook__${name}.xml`), xml);
}

/** Fecha um alerta do app que tenha ficado aberto (ex.: teste anterior falhou antes de tocar em OK). */
async function dismissAppAlert() {
  const alert = $(loc('alert.container'));
  if (!(await alert.isDisplayed().catch(() => false))) return;
  await $(loc('alert.button', { text: 'OK' })).click().catch(() => {});
}

/** Fecha e reabre o app (reinício completo). Usado só como plano B. */
async function relaunchApp() {
  const appId = APP_IDS[driver.isIOS ? 'ios' : 'android'];
  await driver.terminateApp(appId);
  await driver.activateApp(appId);
}

async function waitForHome(timeout) {
  const home = $(loc('home.screen'));
  await driver.waitUntil(
    async () => {
      await dismissSystemDialogs();
      return home.isDisplayed().catch(() => false);
    },
    { timeout, interval: 1000 },
  );
}

/**
 * Deixa o app na tela Home antes de cada teste.
 *
 * Estratégia: reset LEVE — fecha alerta/teclado pendente e toca na aba Home (instantâneo). Só se a Home não aparecer
 * o app é fechado e reaberto. Cada arquivo de spec já começa com o app recém-instalado (nova sessão do Appium).
 *
 * Histórico (execuções reais):
 * - 1ª no Mac (Android): o reinício ficava no hook beforeTest do WebdriverIO, que roda DEPOIS do beforeEach do Mocha;
 *   o teste navegava para Login e o reinício voltava para a Home.
 * - 1º pipeline (emulador do GitHub, sem aceleração de vídeo): fechar/reabrir o app a cada teste estourou 20 s.
 * - Simulador iOS 27 no Mac: fechar o app levou 35 s e reabrir falhou 3 vezes ("Timed out attempting to launch app").
 *   Daí o reset leve, com o fecha-e-reabre só como plano B.
 */
export async function restartApp() {
  try {
    await dismissAppAlert();
    if (await driver.isKeyboardShown().catch(() => false)) {
      if (driver.isIOS) await $(loc('tabBar.home')).click().catch(() => {});
      else await driver.hideKeyboard().catch(() => {});
    }
    await $(loc('tabBar.home')).click();
    await waitForHome(5000);
    return;
  } catch {
    // segue para o plano B
  }

  try {
    await relaunchApp();
    await waitForHome(Number(process.env.APP_START_TIMEOUT || 60000));
  } catch {
    await saveHookEvidence(`restartApp_${Date.now()}`);
    throw new Error('App não voltou para a Home [locator:home.screen] (screenshot e page source salvos em evidence/)');
  }
}
