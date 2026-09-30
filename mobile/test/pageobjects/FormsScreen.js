import Screen from './Screen.js';
import Navigation from './components/Navigation.js';
import { el } from '../support/locators.js';

class FormsScreen extends Screen {
  constructor() {
    super('forms.screen');
  }

  get input() { return el('forms.input'); }
  get inputResult() { return el('forms.inputResult'); }
  get switch() { return el('forms.switch'); }
  get switchText() { return el('forms.switchText'); }
  get buttonActive() { return el('forms.buttonActive'); }
  get buttonInactive() { return el('forms.buttonInactive'); }

  async open() {
    await Navigation.goTo('forms');
    return this.waitForDisplayed();
  }

  async typeText(text) {
    await this.type(this.input, text);
    await this.hideKeyboard();
  }

  async toggleSwitch() {
    await this.switch.click();
  }

  async selectDropdown(optionText) {
    await el('forms.dropdown').click();
    if (driver.isIOS) {
      await el('forms.dropdownOption').setValue(optionText); // PickerWheel aceita o texto da opção
      await el('forms.dropdownDone').click();
    } else {
      await el('forms.dropdownOption', { text: optionText }).click();
    }
  }

  async dropdownValue() {
    return el('forms.dropdownValue').getText();
  }

  /** Os botões ficam no fim do formulário: rola até eles antes de interagir. */
  async scrollToButtons() {
    // No WebdriverIO v9, scrollIntoView() funciona em apps nativos (faz swipes até o elemento aparecer).
    await this.buttonActive.scrollIntoView({ maxScrolls: 5 });
    await this.buttonActive.waitForDisplayed();
  }
}

export default new FormsScreen();
