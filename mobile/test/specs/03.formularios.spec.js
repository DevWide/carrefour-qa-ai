import { expect } from 'chai';
import allure from '@wdio/allure-reporter';
import FormsScreen from '../pageobjects/FormsScreen.js';
import NativeAlert from '../pageobjects/components/NativeAlert.js';

describe('Preenchimento de formulários', () => {
  beforeEach(async () => {
    allure.addFeature('Formulários');
    await FormsScreen.open();
  });

  it('CT08 @smoke deve refletir o texto digitado e alternar o switch', async () => {
    await FormsScreen.typeText('Banco Carrefour QA');
    expect(await FormsScreen.inputResult.getText()).to.equal('Banco Carrefour QA');

    expect(await FormsScreen.switchText.getText()).to.equal('Click to turn the switch ON');
    await FormsScreen.toggleSwitch();
    expect(await FormsScreen.switchText.getText()).to.equal('Click to turn the switch OFF');
    await FormsScreen.toggleSwitch();
    expect(await FormsScreen.switchText.getText()).to.equal('Click to turn the switch ON');
  });

  it('CT09 deve selecionar uma opção no dropdown', async () => {
    await FormsScreen.selectDropdown('Appium is awesome');

    expect(await FormsScreen.dropdownValue()).to.equal('Appium is awesome');
  });

  it('CT10 botão "Active" deve abrir alerta e botão "Inactive" não deve reagir', async () => {
    await FormsScreen.scrollToButtons();

    await FormsScreen.buttonActive.click();
    await NativeAlert.waitForDisplayed();
    expect(await NativeAlert.title()).to.equal('This button is');
    expect(await NativeAlert.message()).to.equal('This button is active');
    await NativeAlert.tap('OK');

    await FormsScreen.buttonInactive.click();
    expect(await NativeAlert.appearsWithin(2000), 'botão inativo não deveria abrir alerta').to.equal(false);
  });
});
