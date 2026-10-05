/**
 * Avisos do SISTEMA (não do app) que podem cobrir a tela no meio de um teste.
 * Não fazem parte do que está sendo testado, então são fechados sempre do mesmo jeito (sem aceitar nada).
 *
 * Histórico (execuções reais no CI):
 * - Android (emulador lento): "X isn't responding" → tocamos em "Wait".
 * - iOS (simulador do GitHub, 2º pipeline): depois de digitar uma senha, o iOS abre o "Save Password?" do app Senhas
 *   por cima do formulário. Os campos e o botão LOGIN ficam cobertos e o teste não consegue digitar nem tocar.
 *   Tocamos em "Not Now" (nunca em "Save").
 * - iOS (Mac em português, depois que o simulador passou a sugerir senhas): "Usar Senha Forte?" no lugar do teclado
 *   ao focar a senha do cadastro; o campo ficava com 1 caractere. Fechamos o painel e digitamos a nossa senha.
 */
// Cada aviso: `aberto` identifica o aviso na tela; `fechar` é o botão neutro que o fecha.
// Inglês e português: o simulador do GitHub está em inglês; um Mac em português mostra os avisos em português.
const PROMPTS = {
  android: [
    { fechar: 'android=new UiSelector().textMatches("(?i)wait|aguardar")' },
    { fechar: 'android=new UiSelector().textMatches("(?i)close app|fechar app")' },
  ],
  ios: [
    // "Save Password?" / "Salvar Senha?" → "Not Now" / "Agora Não"
    { fechar: '-ios class chain:**/XCUIElementTypeSheet/**/XCUIElementTypeButton[`name IN {"Not Now", "Agora Não", "Agora não"}`]' },
    // "Use Strong Password?" / "Usar Senha Forte?": ocupa o lugar do teclado ao focar um campo de senha do cadastro
    // e o texto digitado não chega ao campo. Fecha no "x" do painel (nome "xmark" em qualquer idioma).
    { aberto: '~GenerateStrongPasswordButton', fechar: '-ios class chain:**/XCUIElementTypeButton[`name == "xmark"`]' },
  ],
};

/** Fecha qualquer aviso do sistema que esteja na tela. Retorna true se fechou algum. */
export async function dismissSystemPrompts() {
  let fechou = false;
  for (const { aberto, fechar } of PROMPTS[driver.isIOS ? 'ios' : 'android']) {
    // eslint-disable-next-line no-await-in-loop
    if (aberto && !(await $(aberto).isDisplayed().catch(() => false))) continue;
    // eslint-disable-next-line no-await-in-loop
    const btn = await $(fechar);
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
