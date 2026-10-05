import * as allure from 'allure-js-commons';
import { expect } from '../../src/support/expect.js';
import { UsuariosService } from '../../src/services/serverest.js';
import { novoUsuario, criarUsuario, registrarParaLimpeza } from '../../src/factories/usuario.js';

/**
 * Divergências encontradas entre o requisito (PDF do desafio) / boas práticas e o comportamento do ServeRest.
 * Estes testes descrevem o comportamento ESPERADO e hoje falham de propósito.
 * Ficam fora da execução padrão ("npm test") e rodam num job separado que pode falhar sem bloquear o pipeline.
 */
describe('@known-issue Divergências conhecidas (requisito x implementação)', () => {
  beforeEach(async () => {
    await allure.epic('API de Usuários');
    await allure.feature('Divergências conhecidas');
    await allure.tag('known-issue');
  });

  it('KI-01: não deve aceitar e-mail duplicado com diferença de maiúsculas/minúsculas', async () => {
    await allure.severity('critical');
    await allure.description(
      'E-mail é case-insensitive (RFC 5321, na prática). Hoje a API aceita "Fulano@x.com" e "fulano@x.com" como contas diferentes, ' +
        'o que permite duas contas para a mesma pessoa e abre brecha para confusão de identidade.',
    );
    const original = await criarUsuario();

    const res = await UsuariosService.criar(novoUsuario({ email: original.email.toUpperCase() }));
    if (res.status === 201) registrarParaLimpeza(res.data._id);

    expect(res.status).to.equal(400);
  });

  it('KI-02: a senha não deve ser exposta nas respostas de consulta', async () => {
    await allure.severity('critical');
    await allure.description('GET /usuarios e GET /usuarios/{id} devolvem o campo "password" em texto puro.');
    const usuario = await criarUsuario();

    const res = await UsuariosService.buscarPorId(usuario._id);

    expect(res.data).to.not.have.property('password');
  });

  it('KI-03: deve limitar a taxa a 100 requisições por minuto (HTTP 429)', async function () {
    this.timeout(60000);
    await allure.severity('normal');
    await allure.description('Requisito do desafio. O ServeRest não implementa rate limiting; após 100 requisições esperávamos 429.');

    const statuses = [];
    for (let i = 0; i < 101; i += 1) {
      // sequencial de propósito: mede o limite, não a concorrência
      // eslint-disable-next-line no-await-in-loop
      statuses.push((await UsuariosService.listar({ email: 'rate.limit@teste.com.br' })).status);
    }

    expect(statuses.slice(0, 100).every((s) => s === 200)).to.equal(true);
    expect(statuses[100]).to.equal(429);
  });

  it('KI-05: não deve aceitar nome composto só de espaços (encontrado pela geração de casos com IA)', async () => {
    await allure.severity('normal');
    await allure.description(
      'Caso CAD-IA-05, gerado por IA e confirmado na revisão humana: a API trata "     " como nome válido. ' +
        'A regra "nome não pode ficar em branco" é aplicada à string vazia, mas não a espaços.',
    );

    const res = await UsuariosService.criar(novoUsuario({ nome: '     ' }));
    if (res.status === 201) registrarParaLimpeza(res.data._id);

    expect(res.status).to.equal(400);
    expect(res.data).to.deep.equal({ nome: 'nome não pode ficar em branco' });
  });

  it('KI-04: recurso inexistente deveria retornar 404, não 400', async () => {
    await allure.severity('minor');

    const res = await UsuariosService.buscarPorId('zzzzzzzzzzzzzzzz');

    expect(res.status).to.equal(404);
  });
});
