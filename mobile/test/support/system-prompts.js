/**
 * Avisos do SISTEMA (não do app) que podem cobrir a tela no meio de um teste.
 * Não fazem parte do que está sendo testado, então são fechados sempre do mesmo jeito (sem aceitar nada).
 *
 * Histórico (execuções reais no CI):
 * - Android (emulador lento): "X isn't responding" → tocamos em "Wait".
 * - iOS (simulador do GitHub, 2º pipeline): depois de digitar uma senha, o iOS abre o "Save Password?" do app Senhas
 *   por cima do formulário. Os campos e o botão LOGIN ficam cobertos e o teste não consegue digitar nem tocar.
 *   No Mac isso não aparecia. Tocamos em "Not Now" (nunca em "Save").
 */
const PROMPTS = {
  android: [
    'android=new UiSelector().textMatches("(?i)wait|aguardar")',
    'android=new UiSelector().textMatches("(?i)close app|fechar app")',
  ],
  ios: [
    '-ios class chain:**/XCUIElementTypeSheet[`name == "Save Password?"`]/**/XCUIElementTypeButton[`name == "Not Now"`]',
  ],
};

/** Fecha qualquer aviso do sistema que esteja na tela. Retorna true se fechou algum. */
export async function dismissSystemPrompts() {
  let fechou = false;
  for (const sel of PROMPTS[driver.isIOS ? 'ios' : 'android']) {
    // eslint-disable-next-line no-await-in-loop
    const btn = await $(sel);
    // eslint-disable-next-line no-await-in-loop
    if (await btn.isDisplayed().catch(() => false)) {
      // eslint-disable-next-line no-await-in-loop
      await btn.click().catch(() => {});
      fechou = true;
    }
  }
  return fechou;
}

/**
 * Espera o elemento aparecer, fechando avisos do sistema a cada tentativa
 * (o "Save Password?" do iOS abre alguns instantes depois do envio do formulário).
 */
export async function waitDisplayedDismissingPrompts(element, { timeout, timeoutMsg }) {
  await driver.waitUntil(
    async () => {
      await dismissSystemPrompts();
      return element.isDisplayed().catch(() => false);
    },
    { timeout, interval: 500, timeoutMsg },
  );
}
