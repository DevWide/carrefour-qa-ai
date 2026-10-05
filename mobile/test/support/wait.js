/**
 * Esperas explícitas ajustadas ao ambiente. Local: WAIT_FACTOR=1 (Mac com aceleração de vídeo).
 * No CI o emulador Android roda sem GPU e fica bem mais lento, então o pipeline usa WAIT_FACTOR=2:
 * toda espera dobra, sem mudar a lógica dos testes.
 *
 *   wait(5000) → 5 s local, 10 s no CI
 */
export const wait = (ms) => Math.round(ms * Number(process.env.WAIT_FACTOR || 1));
