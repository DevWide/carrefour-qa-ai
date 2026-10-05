import Screen from './Screen.js';
import Navigation from './components/Navigation.js';
import { el } from '../support/locators.js';
import { dismissSystemPrompts } from '../support/system-prompts.js';
import { wait } from '../support/wait.js';

class LoginScreen extends Screen {
  constructor() {
    super('login.screen');
  }

  get email() { return el('login.email'); }
  get password() { return el('login.password'); }
  get repeatPassword() { return el('login.repeatPassword'); }

  async open() {
    await Navigation.goTo('login');
    return this.waitForDisplayed();
  }

  async switchToLogin() {
    await this.switchTab('login.tabLogin', 'login.submitLogin');
  }

  async switchToSignUp() {
    await this.switchTab('login.tabSignUp', 'login.repeatPassword');
  }

  /**
   * Troca de aba (Login / Sign up) até o formulário certo estar visível.
   * Pipeline #7 (iOS no GitHub): o "Save Password?" do teste anterior abriu alguns segundos DEPOIS da checagem,
   * cobriu o formulário e o toque na aba se perdeu. Por isso a troca é repetida, fechando avisos a cada volta.
   */
  async switchTab(tabKey, readyKey) {
    const ready = el(readyKey);
    await driver.waitUntil(
      async () => {
        await dismissSystemPrompts();
        if (await ready.isDisplayed().catch(() => false)) return true;
        await el(tabKey).click().catch(() => {});
        return ready.isDisplayed().catch(() => false);
      },
      { timeout: wait(15000), interval: 1000, timeoutMsg: `A aba [locator:${tabKey}] não abriu o formulário [locator:${readyKey}]` },
    );
  }

  async login({ email, password }) {
    await this.switchToLogin();
    await this.type(this.email, email);
    await this.type(this.password, password);
    await this.hideKeyboard();
    await el('login.submitLogin').click();
  }

  async signUp({ email, password, repeatPassword = password }) {
    await this.switchToSignUp();
    await this.type(this.email, email);
    await this.type(this.password, password);
    await this.type(this.repeatPassword, repeatPassword);
    await this.hideKeyboard();
    await el('login.submitSignUp').click();
  }

  /** Mensagem de validação exibida abaixo do campo (errorMessage do input). */
  errorMessage(text) {
    return el('login.errorText', { text });
  }
}

export default new LoginScreen();
