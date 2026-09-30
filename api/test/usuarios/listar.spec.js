import * as allure from 'allure-js-commons';
import { expect } from '../../src/support/expect.js';
import { schemas } from '../../src/schemas/index.js';
import { UsuariosService } from '../../src/services/serverest.js';
import { criarUsuario } from '../../src/factories/usuario.js';

describe('GET /usuarios — listar usuários', () => {
  let usuario;

  before(async () => {
    usuario = await criarUsuario({ administrador: 'true' });
  });

  beforeEach(async () => {
    await allure.epic('API de Usuários');
    await allure.feature('Listar usuários');
  });

  it('@smoke deve retornar 200 e uma lista que respeita o contrato', async () => {
    const res = await UsuariosService.listar();

    expect(res.status).to.equal(200);
    expect(res.data).to.matchSchema(schemas.listaUsuarios);
    expect(res.data.quantidade).to.equal(res.data.usuarios.length);
  });

  it('deve conter o usuário recém-criado na listagem', async () => {
    const res = await UsuariosService.listar();

    const ids = res.data.usuarios.map((u) => u._id);
    expect(ids).to.include(usuario._id);
  });

  it('deve filtrar por email e retornar exatamente um usuário', async () => {
    const res = await UsuariosService.listar({ email: usuario.email });

    expect(res.status).to.equal(200);
    expect(res.data.quantidade).to.equal(1);
    expect(res.data.usuarios[0]).to.deep.include({ _id: usuario._id, nome: usuario.nome, email: usuario.email });
  });

  it('deve filtrar por _id', async () => {
    const res = await UsuariosService.listar({ _id: usuario._id });

    expect(res.status).to.equal(200);
    expect(res.data.quantidade).to.equal(1);
    expect(res.data.usuarios[0]._id).to.equal(usuario._id);
  });

  it('deve filtrar por administrador e retornar somente usuários daquele perfil', async () => {
    const res = await UsuariosService.listar({ administrador: 'true' });

    expect(res.status).to.equal(200);
    expect(res.data.quantidade).to.be.greaterThan(0);
    expect(res.data.usuarios.every((u) => u.administrador === 'true')).to.equal(true);
  });

  it('deve combinar filtros (nome + administrador)', async () => {
    const res = await UsuariosService.listar({ nome: usuario.nome, administrador: 'true' });

    expect(res.status).to.equal(200);
    expect(res.data.usuarios.map((u) => u._id)).to.include(usuario._id);
  });

  it('deve retornar lista vazia quando o filtro não encontra ninguém', async () => {
    const res = await UsuariosService.listar({ email: 'ninguem.existe.aqui@teste.com.br' });

    expect(res.status).to.equal(200);
    expect(res.data).to.deep.equal({ quantidade: 0, usuarios: [] });
  });

  it('deve retornar 400 para parâmetro de consulta não previsto', async () => {
    const res = await UsuariosService.listar({ cpf: '123' });

    expect(res.status).to.equal(400);
    expect(res.data).to.deep.equal({ cpf: 'cpf não é permitido' });
  });

  it('deve retornar 400 para filtro administrador com valor inválido', async () => {
    const res = await UsuariosService.listar({ administrador: 'talvez' });

    expect(res.status).to.equal(400);
    expect(res.data).to.matchSchema(schemas.errosValidacao);
    expect(res.data).to.have.property('administrador');
  });
});
