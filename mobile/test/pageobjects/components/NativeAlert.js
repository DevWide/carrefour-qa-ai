import { el } from '../../support/locators.js';

/** Alerta nativo (Android AlertDialog / iOS UIAlertController). */
class NativeAlert {
  async waitForDisplayed(timeout = 10000) {
    await el('alert.container').waitForDisplayed({ timeout, timeoutMsg: 'Alerta nativo [locator:alert.container] não apareceu' });
  }

  async isDisplayed() {
    return el('alert.container').isDisplayed();
  }

  /**
   * Garante que NENHUM alerta aparece dentro da janela de tempo.
   * O app simula uma chamada de API de 1,5 s antes do alerta de sucesso, então checar só uma vez daria falso negativo.
   */
  async appearsWithin(ms = 2500) {
    try {
      await el('alert.container').waitForDisplayed({ timeout: ms });
      return true;
    } catch {
      return false;
    }
  }

  async title() {
    return el('alert.title').getText();
  }

  async message() {
    return el('alert.message').getText();
  }

  async tap(buttonText) {
    await el('alert.button', { text: buttonText }).click();
    await el('alert.container').waitForDisplayed({ reverse: true, timeout: 5000 });
  }
}

export default new NativeAlert();
