import * as allure from 'allure-js-commons';
import { expect } from '../../src/support/expect.js';
import { UsuariosService, CarrinhosService } from '../../src/services/serverest.js';
import { criarUsuario, criarUsuarioAutenticado } from '../../src/factories/usuario.js';
import { http } from '../../src/client/http.js';

describe('DELETE /usuarios/{id} — excluir usuário', () => {
  beforeEach(async () => {
    await allure.epic('API de Usuários');
    await allure.feature('Excluir usuário');
  });

  it('@smoke deve excluir o usuário e ele não deve mais ser encontrado', async () => {
    const usuario = await criarUsuario();

    const res = await UsuariosService.excluir(usuario._id);
    const consulta = await UsuariosService.buscarPorId(usuario._id);

    expect(res.status).to.equal(200);
    expect(res.data).to.deep.equal({ message: 'Registro excluído com sucesso' });
    expect(consulta.status).to.equal(400);
    expect(consulta.data).to.deep.equal({ message: 'Usuário não encontrado' });
  });

  it('deve ser idempotente: excluir id inexistente retorna 200 "Nenhum registro excluído"', async () => {
    const res = await UsuariosService.excluir('naoExiste1234567');

    expect(res.status).to.equal(200);
    expect(res.data).to.deep.equal({ message: 'Nenhum registro excluído' });
  });

  it('deve impedir (400) a exclusão de usuário com carrinho cadastrado', async () => {
    const usuario = await criarUsuarioAutenticado();
    const produtos = await http.get('/produtos');
    const carrinho = await CarrinhosService.criar(
      { produtos: [{ idProduto: produtos.data.produtos[0]._id, quantidade: 1 }] },
      usuario.token,
    );

    try {
      const res = await UsuariosService.excluir(usuario._id);

      expect(carrinho.status).to.equal(201);
      expect(res.status).to.equal(400);
      expect(res.data).to.deep.equal({
        message: 'Não é permitido excluir usuário com carrinho cadastrado',
        idCarrinho: carrinho.data._id,
      });
    } finally {
      await CarrinhosService.cancelar(usuario.token); // devolve estoque e libera a limpeza do usuário
    }
  });
});
