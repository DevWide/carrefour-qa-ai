import * as allure from 'allure-js-commons';
import { expect } from '../../src/support/expect.js';
import { UsuariosService } from '../../src/services/serverest.js';
import { criarUsuario } from '../../src/factories/usuario.js';

// SLA de referência. Configurável porque o ambiente público (serverest.dev) é mais lento que o local.
const SLA_MS = Number(process.env.API_SLA_MS || 1000);

describe('Requisitos não funcionais — tempo de resposta', () => {
  let usuario;

  before(async () => {
    usuario = await criarUsuario();
  });

  beforeEach(async () => {
    await allure.epic('API de Usuários');
    await allure.feature('Não funcional');
    await allure.parameter('SLA (ms)', String(SLA_MS));
  });

  const operacoes = {
    'GET /usuarios': () => UsuariosService.listar(),
    'GET /usuarios/{id}': () => UsuariosService.buscarPorId(usuario._id),
    'PUT /usuarios/{id}': () => UsuariosService.atualizar(usuario._id, { ...usuario, _id: undefined, nome: 'Atualizado' }),
  };

  for (const [nome, operacao] of Object.entries(operacoes)) {
    it(`${nome} deve responder dentro do SLA`, async () => {
      const res = await operacao();

      expect(res.status).to.be.within(200, 299);
      expect(res.duration, `${nome} levou ${res.duration} ms`).to.be.at.most(SLA_MS);
    });
  }
});
