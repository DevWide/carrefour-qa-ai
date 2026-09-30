import * as allure from 'allure-js-commons';
import { expect } from '../../src/support/expect.js';
import { schemas } from '../../src/schemas/index.js';
import { LoginService, ProdutosService, UsuariosService } from '../../src/services/serverest.js';
import { criarUsuario, criarUsuarioAutenticado } from '../../src/factories/usuario.js';

function decodeJwt(bearer) {
  const [, payload] = bearer.replace('Bearer ', '').split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

const produtoFake = () => ({
  nome: `Produto QA ${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  preco: 10,
  descricao: 'Criado pela suíte de testes',
  quantidade: 1,
});

describe('POST /login — autenticação JWT', () => {
  beforeEach(async () => {
    await allure.epic('API de Usuários');
    await allure.feature('Autenticação (JWT)');
  });

  it('@smoke deve autenticar com credenciais válidas e retornar um Bearer JWT', async () => {
    const usuario = await criarUsuario();

    const res = await LoginService.autenticar(usuario.email, usuario.password);

    expect(res.status).to.equal(200);
    expect(res.data).to.matchSchema(schemas.loginSucesso);
  });

  it('o JWT deve identificar o usuário e ter expiração posterior à emissão', async () => {
    const usuario = await criarUsuario();

    const res = await LoginService.autenticar(usuario.email, usuario.password);
    const claims = decodeJwt(res.data.authorization);

    expect(claims.email).to.equal(usuario.email);
    expect(claims.exp).to.be.greaterThan(claims.iat);
  });

  it('deve retornar 401 para senha incorreta', async () => {
    const usuario = await criarUsuario();

    const res = await LoginService.autenticar(usuario.email, 'senhaErrada!');

    expect(res.status).to.equal(401);
    expect(res.data).to.deep.equal({ message: 'Email e/ou senha inválidos' });
  });

  it('deve retornar 401 para e-mail não cadastrado (mesma mensagem, sem revelar se o e-mail existe)', async () => {
    const res = await LoginService.autenticar('nao.cadastrado@teste.com.br', 'qualquer');

    expect(res.status).to.equal(401);
    expect(res.data).to.deep.equal({ message: 'Email e/ou senha inválidos' });
  });

  it('deve retornar 400 quando e-mail e senha não são enviados', async () => {
    const res = await LoginService.autenticarComCorpo({});

    expect(res.status).to.equal(400);
    expect(res.data).to.deep.equal({ email: 'email é obrigatório', password: 'password é obrigatório' });
  });

  describe('uso do token em rota protegida (POST /produtos)', () => {
    it('token de administrador deve ser aceito (201)', async () => {
      const admin = await criarUsuarioAutenticado({ administrador: 'true' });

      const res = await ProdutosService.criar(produtoFake(), admin.token);
      await ProdutosService.excluir(res.data._id, admin.token);

      expect(res.status).to.equal(201);
    });

    it('token de usuário comum deve ser recusado por autorização (403)', async () => {
      const comum = await criarUsuarioAutenticado({ administrador: 'false' });

      const res = await ProdutosService.criar(produtoFake(), comum.token);

      expect(res.status).to.equal(403);
      expect(res.data).to.deep.equal({ message: 'Rota exclusiva para administradores' });
    });

    const tokensInvalidos = {
      'sem token': undefined,
      'token malformado': 'Bearer invalido',
      'token com assinatura adulterada': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFAYi5jb20ifQ.assinatura',
    };
    for (const [cenario, token] of Object.entries(tokensInvalidos)) {
      it(`deve retornar 401 com ${cenario}`, async () => {
        const res = await ProdutosService.criar(produtoFake(), token);

        expect(res.status).to.equal(401);
        expect(res.data.message).to.match(/Token de acesso ausente, inválido, expirado/);
      });
    }

    it('token de usuário excluído deve deixar de ser aceito (401)', async () => {
      const admin = await criarUsuarioAutenticado({ administrador: 'true' });
      await UsuariosService.excluir(admin._id);

      const res = await ProdutosService.criar(produtoFake(), admin.token);

      expect(res.status).to.equal(401);
    });
  });
});
