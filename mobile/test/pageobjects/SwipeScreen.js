import Screen from './Screen.js';
import Navigation from './components/Navigation.js';
import { el } from '../support/locators.js';

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

  /** Arrasta o carrossel da direita para a esquerda (próximo card). */
  async swipeLeft() {
    const { width, height } = await driver.getWindowSize();
    const y = Math.round(height * 0.45);
    await driver.swipe({ direction: 'left', duration: 400, percent: 0.8, from: { x: Math.round(width * 0.85), y }, to: { x: Math.round(width * 0.15), y } });
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
