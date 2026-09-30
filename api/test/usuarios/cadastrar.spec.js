import * as allure from 'allure-js-commons';
import { expect } from '../../src/support/expect.js';
import { schemas } from '../../src/schemas/index.js';
import { UsuariosService } from '../../src/services/serverest.js';
import { novoUsuario, criarUsuario, registrarParaLimpeza } from '../../src/factories/usuario.js';
import { carregarCasos, materializar } from '../../src/support/data.js';

describe('POST /usuarios — cadastrar usuário', () => {
  beforeEach(async () => {
    await allure.epic('API de Usuários');
    await allure.feature('Cadastrar usuário');
  });

  it('@smoke deve cadastrar usuário comum e retornar 201 com _id', async () => {
    const dados = novoUsuario({ administrador: 'false' });

    const res = await UsuariosService.criar(dados);
    registrarParaLimpeza(res.data._id);

    expect(res.status).to.equal(201);
    expect(res.data).to.matchSchema(schemas.cadastroSucesso);
  });

  it('deve persistir exatamente os dados enviados (verificação via GET)', async () => {
    const dados = novoUsuario({ administrador: 'true' });

    const criado = await UsuariosService.criar(dados);
    registrarParaLimpeza(criado.data._id);
    const consultado = await UsuariosService.buscarPorId(criado.data._id);

    expect(consultado.status).to.equal(200);
    expect(consultado.data).to.deep.equal({ ...dados, _id: criado.data._id });
  });

  it('deve retornar 400 ao cadastrar e-mail já utilizado', async () => {
    const existente = await criarUsuario();

    const res = await UsuariosService.criar(novoUsuario({ email: existente.email }));

    expect(res.status).to.equal(400);
    expect(res.data).to.deep.equal({ message: 'Este email já está sendo usado' });
  });

  it('deve retornar 400 para JSON malformado', async () => {
    const res = await UsuariosService.criarComCorpoCru('{"nome": "sem fechar"');

    expect(res.status).to.equal(400);
    expect(res.data).to.matchSchema(schemas.mensagem);
  });

  describe('validação de campos (data-driven: data/cadastro-invalido*.json)', () => {
    for (const caso of carregarCasos('cadastro-invalido')) {
      it(`[${caso.id}] deve rejeitar ${caso.descricao} (origem: ${caso.origem})`, async () => {
        await allure.parameter('caso', caso.id);
        await allure.parameter('origem', caso.origem);
        await allure.tag(`origem:${caso.origem}`);
        const payload = materializar(caso.payload);

        const res = await UsuariosService.criar(payload);
        if (res.status === 201) registrarParaLimpeza(res.data._id);

        expect(res.status).to.equal(400);
        expect(res.data).to.matchSchema(schemas.errosValidacao);
        expect(res.data).to.deep.equal(caso.errosEsperados);
      });
    }
  });
});
