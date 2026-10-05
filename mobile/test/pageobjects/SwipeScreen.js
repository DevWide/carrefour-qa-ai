import Screen from './Screen.js';
import Navigation from './components/Navigation.js';
import { el, loc } from '../support/locators.js';
import { wait } from '../support/wait.js';

/** Cards do carrossel do native-demo-app v2.2.0, na ordem. */
const CARD_TITLES = ['FULLY OPEN SOURCE', 'GREAT COMMUNITY', 'JS.FOUNDATION', 'SUPPORT VIDEOS', 'EXTENDABLE', 'COMPATIBLE'];

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
   * Histórico (execuções reais):
   * 1ª: gesto a 45% da altura da tela passava ACIMA do carrossel — nada acontecia.
   * 2ª: W3C actions na altura do card moviam só o 1º card; o carrossel (reanimated + gesture-handler)
   *     ignorava os gestos seguintes. Solução: gesto nativo de cada plataforma sobre a área do card.
   * 3ª (iOS no CI): o iOS mantém todos os cards na hierarquia, inclusive os que já saíram da tela;
   *     pegar "o primeiro card" escolhia um card invisível. Solução: usar o primeiro card visível.
   * 4ª (BrowserStack, Galaxy S23 real): o gesto nativo não moveu o carrossel nenhuma vez (screenshot: parado
   *     no 1º card), enquanto no Pixel 8 da mesma execução passou. Solução: conferir se o card mudou e,
   *     se não mudou, repetir com um arrasto mais lento (W3C actions). Pular um card a mais não é risco:
   *     o swipeUntilCard confere o título a cada volta e o último card é o alvo.
   * 5ª (BrowserStack, os dois aparelhos): a 1ª versão da conferência comparava a POSIÇÃO dos cards — no Android
   *     o card atual fica sempre no mesmo lugar, então "parecia" não ter andado (evidência: já estava no 2º card).
   *     E o arrasto W3C quebrava no BrowserStack: o WebdriverIO libera as ações com DELETE /actions, que o
   *     servidor de lá não aceita. Agora a conferência usa os TÍTULOS visíveis e o arrasto não chama o DELETE.
   */
  async swipeLeft() {
    const antes = await this.visibleTitles();
    await this.nativeSwipe(await this.visibleCard());
    await driver.pause(wait(700)); // espera o "snap" do carrossel terminar antes de ler a tela
    if ((await this.visibleTitles()) !== antes) return;

    await this.dragSwipe(await this.visibleCard());
    await driver.pause(wait(700));
  }

  async nativeSwipe(card) {
    const { x, y } = await card.getLocation();
    const { width, height } = await card.getSize();
    if (driver.isIOS) {
      await driver.execute('mobile: swipe', { direction: 'left', elementId: await card.elementId });
      return;
    }
    await driver.execute('mobile: swipeGesture', {
      left: Math.round(x + width * 0.1),
      top: Math.round(y + height * 0.25),
      width: Math.round(width * 0.8),
      height: Math.round(height * 0.5),
      direction: 'left',
      percent: 0.9,
    });
  }

  /** Arrasto "de dedo" mais lento, no meio do card: plano B quando o gesto nativo não move o carrossel. */
  async dragSwipe(card) {
    const { x, y } = await card.getLocation();
    const { width, height } = await card.getSize();
    const meioY = Math.round(y + height / 2);
    await driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: Math.round(x + width * 0.85), y: meioY })
      .down()
      .pause(150)
      .move({ duration: 600, x: Math.round(x + width * 0.1), y: meioY })
      .pause(150)
      .up()
      .perform(true); // true = não chama DELETE /actions depois (o BrowserStack responde 404 e o teste quebrava)
  }

  /**
   * Títulos de card visíveis agora (o atual e o que aparece na beirada). Se o carrossel andou, a lista muda.
   * No iOS os cards fora da tela continuam na hierarquia, mas com "visible=false" — por isso isDisplayed.
   */
  async visibleTitles() {
    const visiveis = [];
    for (const titulo of CARD_TITLES) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.cardTitle(titulo).isDisplayed().catch(() => false)) visiveis.push(titulo);
    }
    return visiveis.join(' | ');
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
