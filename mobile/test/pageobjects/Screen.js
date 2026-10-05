import { el } from '../support/locators.js';
import { wait } from '../support/wait.js';
import { dismissSystemPrompts } from '../support/system-prompts.js';

/** Base dos Page Objects: esperas explícitas e ações comuns. Nenhum Page Object usa pause() fixo. */
export default class Screen {
  /** @param {string} screenKey chave do container da tela em locators.json */
  constructor(screenKey) {
    this.screenKey = screenKey;
  }

  get container() {
    return el(this.screenKey);
  }

  async waitForDisplayed({ timeout = wait(15000), reverse = false } = {}) {
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

  /**
   * Digita no campo e, no iOS, confere o que o campo realmente recebeu.
   * Evidência do simulador iOS: no cadastro, o campo de senha (secure) ficou com 1 caractere em vez de 10 —
   * campos de senha do iOS podem apagar o conteúdo ao receber o foco de novo. Se não bater, digita outra vez (até 2x).
   */
  async type(element, value) {
    await dismissSystemPrompts();
    await element.waitForDisplayed();
    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (tentativa > 1) await dismissSystemPrompts(); // um aviso do sistema pode ter coberto o campo
      // eslint-disable-next-line no-await-in-loop
      await element.clearValue();
      // eslint-disable-next-line no-await-in-loop
      if (value !== '') await element.setValue(value);
      // eslint-disable-next-line no-await-in-loop
      if (!driver.isIOS || (await this.typedCorrectly(element, value))) return;
    }
    throw new Error(`O campo não recebeu o valor completo após 3 tentativas (esperados ${value.length} caracteres)`);
  }

  async typedCorrectly(element, value) {
    const atual = (await element.getAttribute('value').catch(() => null)) ?? '';
    const tipo = await element.getAttribute('type').catch(() => '');
    if (value === '') return true; // campo vazio no iOS devolve o placeholder: nada a conferir
    if (String(tipo).includes('Secure')) return [...atual].length === [...value].length; // senha: compara a quantidade de "•"
    return atual === value;
  }
}
