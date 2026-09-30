import { http, BASE_URL } from '../src/client/http.js';
import { limparUsuariosCriados } from '../src/factories/usuario.js';

// Hooks globais (root hooks) do Mocha.
export const mochaHooks = {
  async beforeAll() {
    // Falha rápido e com mensagem clara se a API não estiver no ar.
    try {
      await http.get('/usuarios', { timeout: 5000 });
    } catch (err) {
      throw new Error(`API indisponível em ${BASE_URL} (${err.code || err.message}). Rode "npm run api:start" ou defina API_BASE_URL.`);
    }
  },
  async afterAll() {
    await limparUsuariosCriados();
  },
};
