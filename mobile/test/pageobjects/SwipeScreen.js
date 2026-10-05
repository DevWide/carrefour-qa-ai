import Screen from './Screen.js';
import Navigation from './components/Navigation.js';
import { el, loc } from '../support/locators.js';
import { wait } from '../support/wait.js';

class SwipeScreen extends Screen {
  constructor() {
    super('swipe.screen');
  }

  async open() {
    await Navigation.goTo('swipe');
    return this.waitForDisplayed();
  }

  cardTitle(text) {
    return el('swipe.cardTitle', { text });
  }

  /**
   * Passa o carrossel para o próximo card (gesto da direita para a esquerda), dentro da área do card.
   *
   * Histórico (execuções reais no emulador):
   * 1ª: gesto a 45% da altura da tela passava ACIMA do carrossel — nada acontecia.
   * 2ª: W3C actions na altura do card moviam só o 1º card; o carrossel (reanimated + gesture-handler)
   *     ignorava os gestos seguintes. Solução: gesto nativo de cada plataforma sobre a área do card.
   * 3ª (iOS no CI): o iOS mantém todos os cards na hierarquia, inclusive os que já saíram da tela;
   *     pegar "o primeiro card" escolhia um card invisível. Solução: usar o primeiro card visível.
   */
  async swipeLeft() {
    const card = await this.visibleCard();
    const { x, y } = await card.getLocation();
    const { width, height } = await card.getSize();

    if (driver.isIOS) {
      await driver.execute('mobile: swipe', { direction: 'left', elementId: await card.elementId });
    } else {
      await driver.execute('mobile: swipeGesture', {
        left: Math.round(x + width * 0.1),
        top: Math.round(y + height * 0.25),
        width: Math.round(width * 0.8),
        height: Math.round(height * 0.5),
        direction: 'left',
        percent: 0.9,
      });
    }
    await driver.pause(wait(700)); // espera o "snap" do carrossel terminar antes de ler a tela
  }

  /** Primeiro card do carrossel que está de fato na tela. */
  async visibleCard() {
    await el('swipe.card').waitForExist();
    const cards = await $$(loc('swipe.card'));
    for (const card of cards) {
      // eslint-disable-next-line no-await-in-loop
      if (await card.isDisplayed()) return card;
    }
    throw new Error('Nenhum card visível no carrossel [locator:swipe.card]');
  }

  /** Faz swipe até o card com o título informado ficar visível (máx. `maxSwipes`). */
  async swipeUntilCard(title, maxSwipes = 8) {
    for (let i = 0; i < maxSwipes; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.cardTitle(title).isDisplayed().catch(() => false)) return i;
      // eslint-disable-next-line no-await-in-loop
      await this.swipeLeft();
    }
    throw new Error(`Card "${title}" não apareceu após ${maxSwipes} swipes`);
  }
}

export default new SwipeScreen();
