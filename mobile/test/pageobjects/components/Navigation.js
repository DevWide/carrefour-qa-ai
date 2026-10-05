import { el } from '../../support/locators.js';
import { wait } from '../../support/wait.js';

/** Barra de abas inferior e menu lateral — os dois caminhos de navegação do app. */
class Navigation {
  async goTo(tab) {
    await el(`tabBar.${tab}`).click();
  }

  async openSideMenu() {
    await el('tabBar.menu').click();
    await el('sideMenu.panel').waitForDisplayed({ timeout: wait(5000) });
  }

  /** @param {string} name nome da rota: webview, login, forms, swipe, drag, permissions, data-management */
  async goToViaSideMenu(name) {
    await this.openSideMenu();
    await el('sideMenu.item', { name }).click();
    await el('sideMenu.panel').waitForDisplayed({ reverse: true, timeout: wait(5000) });
  }
}

export default new Navigation();
