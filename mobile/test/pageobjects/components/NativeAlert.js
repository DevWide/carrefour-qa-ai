import { el } from '../../support/locators.js';
import { wait } from '../../support/wait.js';
import { waitDisplayedDismissingPrompts } from '../../support/system-prompts.js';

/** Alerta nativo (Android AlertDialog / iOS UIAlertController). */
class NativeAlert {
  async waitForDisplayed(timeout = wait(10000)) {
    await waitDisplayedDismissingPrompts(el('alert.container'), { timeout, timeoutMsg: 'Alerta nativo [locator:alert.container] não apareceu' });
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
      await waitDisplayedDismissingPrompts(el('alert.container'), { timeout: wait(ms) });
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
    await el('alert.container').waitForDisplayed({ reverse: true, timeout: wait(5000) });
  }
}

export default new NativeAlert();
