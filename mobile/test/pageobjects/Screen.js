import { el } from '../support/locators.js';

/** Base dos Page Objects: esperas explícitas e ações comuns. Nenhum Page Object usa pause() fixo. */
export default class Screen {
  /** @param {string} screenKey chave do container da tela em locators.json */
  constructor(screenKey) {
    this.screenKey = screenKey;
  }

  get container() {
    return el(this.screenKey);
  }

  async waitForDisplayed({ timeout = 15000, reverse = false } = {}) {
    await this.container.waitForDisplayed({ timeout, reverse, timeoutMsg: `Tela [locator:${this.screenKey}] não ${reverse ? 'fechou' : 'apareceu'} em ${timeout} ms` });
    return this;
  }

  async isDisplayed() {
    return this.container.isDisplayed();
  }

  async hideKeyboard() {
    if (driver.isIOS) {
      // no iOS o teclado fecha tocando fora do campo
      if (await driver.isKeyboardShown()) await el(this.screenKey).click();
      return;
    }
    if (await driver.isKeyboardShown()) await driver.hideKeyboard();
  }

  async type(element, value) {
    await element.waitForDisplayed();
    await element.clearValue();
    if (value !== '') await element.setValue(value);
  }
}
