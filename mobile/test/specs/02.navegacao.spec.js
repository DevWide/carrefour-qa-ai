import { expect } from 'chai';
import allure from '@wdio/allure-reporter';
import { restartApp } from '../support/app.js';
import Navigation from '../pageobjects/components/Navigation.js';
import LoginScreen from '../pageobjects/LoginScreen.js';
import FormsScreen from '../pageobjects/FormsScreen.js';
import SwipeScreen from '../pageobjects/SwipeScreen.js';
import { HomeScreen, DragScreen, PermissionsScreen, DataManagementScreen } from '../pageobjects/SimpleScreens.js';

describe('Navegação entre telas', () => {
  beforeEach(async () => {
    allure.addFeature('Navegação');
    await restartApp();
  });

  it('CT05 @smoke deve navegar por todas as abas da barra inferior', async () => {
    const abas = [
      ['login', LoginScreen],
      ['forms', FormsScreen],
      ['swipe', SwipeScreen],
      ['drag', DragScreen],
      ['home', HomeScreen],
    ];

    for (const [aba, tela] of abas) {
      // eslint-disable-next-line no-await-in-loop
      await Navigation.goTo(aba);
      // eslint-disable-next-line no-await-in-loop
      await tela.waitForDisplayed();
      // eslint-disable-next-line no-await-in-loop
      expect(await tela.isDisplayed(), `tela da aba "${aba}"`).to.equal(true);
    }
  });

  it('CT06 deve acessar pelo menu lateral as telas que não estão na barra inferior', async () => {
    await Navigation.goToViaSideMenu('permissions');
    await PermissionsScreen.waitForDisplayed();
    expect(await PermissionsScreen.isDisplayed()).to.equal(true);

    await Navigation.goToViaSideMenu('data-management');
    await DataManagementScreen.waitForDisplayed();
    expect(await DataManagementScreen.isDisplayed()).to.equal(true);
  });

  it('CT07 deve percorrer o carrossel com swipe até o último card', async () => {
    await SwipeScreen.open();

    const swipes = await SwipeScreen.swipeUntilCard('COMPATIBLE');

    expect(swipes, 'quantidade de swipes até o último card').to.be.greaterThan(0);
    expect(await SwipeScreen.cardTitle('COMPATIBLE').isDisplayed()).to.equal(true);
  });
});
