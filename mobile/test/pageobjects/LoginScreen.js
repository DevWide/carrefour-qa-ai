import Screen from './Screen.js';
import Navigation from './components/Navigation.js';
import { el } from '../support/locators.js';

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
    await el('login.tabLogin').click();
    await el('login.submitLogin').waitForDisplayed();
  }

  async switchToSignUp() {
    await el('login.tabSignUp').click();
    await this.repeatPassword.waitForDisplayed();
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
