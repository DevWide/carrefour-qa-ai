import { loc } from './locators.js';

const APP_IDS = { android: 'com.wdiodemoapp', ios: 'org.wdiodemoapp' };

/**
 * Fecha e reabre o app para cada teste começar do mesmo estado (tela Home), sem reinstalar.
 *
 * Chamado no início do beforeEach de cada spec, ANTES de navegar para a tela do teste.
 * Na 1ª execução real isso ficava no hook beforeTest do WebdriverIO, que roda DEPOIS do
 * beforeEach do Mocha: o teste navegava para Login e o reinício do app voltava para a Home.
 */
export async function restartApp() {
  const appId = APP_IDS[driver.isIOS ? 'ios' : 'android'];
  await driver.terminateApp(appId);
  await driver.activateApp(appId);
  await $(loc('home.screen')).waitForDisplayed({ timeout: 20000, timeoutMsg: 'App não voltou para a Home [locator:home.screen]' });
}
