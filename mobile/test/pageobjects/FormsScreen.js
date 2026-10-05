import Screen from './Screen.js';
import Navigation from './components/Navigation.js';
import { el } from '../support/locators.js';
import { wait } from '../support/wait.js';

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
    if (driver.isIOS) {
      await this.openIosPicker();
      await el('forms.dropdownOption').setValue(optionText); // PickerWheel aceita o texto da opção
      await el('forms.dropdownDone').click();
    } else {
      await el('forms.dropdown').click();
      await el('forms.dropdownOption', { text: optionText }).click();
    }
  }

  /**
   * No iOS o toque no container "Dropdown" (accessible=false) não abre o seletor — evidência da 1ª execução
   * no simulador do CI. Tenta a setinha (dropdown-chevron); se a roda não aparecer, toca no centro do campo.
   */
  async openIosPicker() {
    const wheel = el('forms.dropdownOption');
    await el('forms.dropdownChevron').click();
    if (await wheel.waitForDisplayed({ timeout: wait(3000) }).catch(() => false)) return;

    const field = el('forms.dropdown');
    const { x, y } = await field.getLocation();
    const { width, height } = await field.getSize();
    await driver.execute('mobile: tap', { x: Math.round(x + width / 2), y: Math.round(y + height / 2) });
    await wheel.waitForDisplayed({ timeout: wait(5000), timeoutMsg: 'Seletor do dropdown não abriu no iOS [locator:forms.dropdownOption]' });
  }

  async dropdownValue() {
    return el('forms.dropdownValue').getText();
  }

  /** Os botões ficam no fim do formulário: rola até eles antes de interagir. */
  async scrollToButtons() {
    // A tela tem dois ScrollView; o padrão do WebdriverIO pega o primeiro (não rolável).
    // Por isso informamos o container da própria tela como elemento rolável.
    await this.buttonActive.scrollIntoView({ scrollableElement: await this.container, maxScrolls: 5 });
    await this.buttonActive.waitForDisplayed();
  }
}

export default new FormsScreen();
