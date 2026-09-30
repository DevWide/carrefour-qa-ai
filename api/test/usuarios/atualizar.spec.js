import * as allure from 'allure-js-commons';
import { expect } from '../../src/support/expect.js';
import { schemas } from '../../src/schemas/index.js';
import { UsuariosService } from '../../src/services/serverest.js';
import { novoUsuario, criarUsuario, registrarParaLimpeza } from '../../src/factories/usuario.js';

describe('PUT /usuarios/{id} — atualizar usuário', () => {
  beforeEach(async () => {
    await allure.epic('API de Usuários');
    await allure.feature('Atualizar usuário');
  });

  it('@smoke deve atualizar todos os campos e retornar 200', async () => {
    const usuario = await criarUsuario({ administrador: 'false' });
    const novosDados = novoUsuario({ administrador: 'true' });

    const res = await UsuariosService.atualizar(usuario._id, novosDados);
    const consultado = await UsuariosService.buscarPorId(usuario._id);

    expect(res.status).to.equal(200);
    expect(res.data).to.deep.equal({ message: 'Registro alterado com sucesso' });
    expect(consultado.data).to.deep.equal({ ...novosDados, _id: usuario._id });
  });

  it('deve permitir manter o mesmo e-mail do próprio usuário', async () => {
    const usuario = await criarUsuario();

    const res = await UsuariosService.atualizar(usuario._id, { ...novoUsuario(), email: usuario.email });

    expect(res.status).to.equal(200);
  });

  it('deve retornar 400 ao tentar usar e-mail de outro usuário', async () => {
    const [a, b] = await Promise.all([criarUsuario(), criarUsuario()]);

    const res = await UsuariosService.atualizar(a._id, novoUsuario({ email: b.email }));
    const aInalterado = await UsuariosService.buscarPorId(a._id);

    expect(res.status).to.equal(400);
    expect(res.data).to.deep.equal({ message: 'Este email já está sendo usado' });
    expect(aInalterado.data.email).to.equal(a.email);
  });

  it('deve retornar 400 quando faltam campos obrigatórios (PUT exige o recurso completo)', async () => {
    const usuario = await criarUsuario();

    const res = await UsuariosService.atualizar(usuario._id, { nome: 'Só o nome' });

    expect(res.status).to.equal(400);
    expect(res.data).to.deep.equal({
      email: 'email é obrigatório',
      password: 'password é obrigatório',
      administrador: 'administrador é obrigatório',
    });
  });

  it('deve criar o usuário (201) quando o id não existe — comportamento de upsert', async () => {
    const dados = novoUsuario();

    const res = await UsuariosService.atualizar('naoExiste1234567', dados);
    registrarParaLimpeza(res.data._id);

    expect(res.status).to.equal(201);
    expect(res.data).to.matchSchema(schemas.cadastroSucesso);
    // O _id do usuário criado é gerado pela API, não o informado na URL.
    expect(res.data._id).to.not.equal('naoExiste1234567');
  });

  it('deve retornar 400 no upsert quando o e-mail já existe', async () => {
    const existente = await criarUsuario();

    const res = await UsuariosService.atualizar('naoExiste7654321', novoUsuario({ email: existente.email }));

    expect(res.status).to.equal(400);
    expect(res.data).to.deep.equal({ message: 'Este email já está sendo usado' });
  });
});
