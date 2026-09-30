import * as allure from 'allure-js-commons';
import { expect } from '../../src/support/expect.js';
import { schemas } from '../../src/schemas/index.js';
import { UsuariosService } from '../../src/services/serverest.js';
import { criarUsuario } from '../../src/factories/usuario.js';

describe('GET /usuarios/{id} — buscar usuário por id', () => {
  beforeEach(async () => {
    await allure.epic('API de Usuários');
    await allure.feature('Buscar usuário por id');
  });

  it('@smoke deve retornar 200 com os dados do usuário e respeitar o contrato', async () => {
    const usuario = await criarUsuario();

    const res = await UsuariosService.buscarPorId(usuario._id);

    expect(res.status).to.equal(200);
    expect(res.data).to.matchSchema(schemas.usuario);
    expect(res.data).to.deep.equal(usuario);
  });

  it('deve retornar 400 "Usuário não encontrado" para id válido inexistente', async () => {
    // Observação: o ServeRest usa 400 onde o REST convencional usaria 404 — documentado no README.
    const res = await UsuariosService.buscarPorId('zzzzzzzzzzzzzzzz');

    expect(res.status).to.equal(400);
    expect(res.data).to.deep.equal({ message: 'Usuário não encontrado' });
  });

  for (const id of ['abc', '12345678901234567', 'id-com-hifen-123']) {
    it(`deve retornar 400 para id com formato inválido ("${id}")`, async () => {
      await allure.parameter('id', id);

      const res = await UsuariosService.buscarPorId(id);

      expect(res.status).to.equal(400);
      expect(res.data).to.deep.equal({ id: 'id deve ter exatamente 16 caracteres alfanuméricos' });
    });
  }
});
