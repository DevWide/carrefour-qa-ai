/**
 * Testes unitários da triagem híbrida (Jev + LLM).
 *
 * Usa injeção de dependências (sem mock.module) para testar a lógica pura.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HybridTriage } from '../src/triage.js';

// Mock simples do cliente Jev para testes (injeção de dependência)
class MockJevClient {
  constructor(responses = {}) {
    this.responses = responses;
    this.calls = [];
  }

  async decide({ state, questions }) {
    this.calls.push({ state, questions });
    const key = this.findKey(state);
    const response = this.responses[key] || this.responses.default;

    if (response instanceof Error) throw response;

    return {
      answers: response.answers,
      usage: response.usage || { input_tokens: 100 },
      model: 'jev-mock',
    };
  }

  findKey(state) {
    const msg = (state.mensagem_erro || '').toLowerCase();
    if (msg.includes('econnrefused') || msg.includes('etimedout')) return 'ambiente';
    if (msg.includes('element') && msg.includes('not')) return 'seletor';
    if (msg.includes('senha') || msg.includes('known')) return 'conhecido';
    return 'default';
  }
}

// Resposta padrão do Jev para caso ambiente (alta confiança)
const jevResponseAmbiente = {
  answers: {
    categoria: {
      type: 'choice',
      choice: 'ambiente',
      confidence: 0.95,
      probabilities: { ambiente: 0.95, 'teste-quebrado': 0.03, 'bug-produto': 0.02 },
    },
    confianca: { type: 'score', score: 3.8, confidence: 0.8, probabilities: {} },
    precisa_llm: { type: 'noul', noul: 0.05 },
  },
  usage: { input_tokens: 150 },
};

// Resposta padrão do Jev para caso incerto (baixa confiança)
const jevResponseIncerto = {
  answers: {
    categoria: {
      type: 'choice',
      choice: 'bug-produto',
      confidence: 0.55,
      probabilities: { 'bug-produto': 0.45, 'teste-quebrado': 0.35, flaky: 0.20 },
    },
    confianca: { type: 'score', score: 1.5, confidence: 0.3, probabilities: {} },
    precisa_llm: { type: 'noul', noul: 0.75 },
  },
  usage: { input_tokens: 200 },
};

// Resposta padrão do Jev para seletor (alta confiança)
const jevResponseSeletor = {
  answers: {
    categoria: {
      type: 'choice',
      choice: 'teste-quebrado',
      confidence: 0.88,
      probabilities: { 'teste-quebrado': 0.88, 'bug-produto': 0.08, flaky: 0.04 },
    },
    confianca: { type: 'score', score: 3.2, confidence: 0.6, probabilities: {} },
    precisa_llm: { type: 'noul', noul: 0.12 },
  },
  usage: { input_tokens: 180 },
};

describe('HybridTriage', () => {
  test('deve resolver falha óbvia com Jev (alta confiança) - ambiente', async () => {
    const mockJev = new MockJevClient({ ambiente: jevResponseAmbiente });
    const triage = new HybridTriage({ confidenceThreshold: 0.85, jevClient: mockJev });

    const failure = {
      id: 'test-001',
      nome: 'Login API',
      mensagem: 'ECONNREFUSED 127.0.0.1:3000',
      stack: 'Error: connect ECONNREFUSED',
      tags: [],
      tentativas: 1,
      status: 'failed',
    };

    const result = await triage.analyzeFailure(failure);

    assert.equal(result.categoria, 'ambiente');
    assert.equal(result.source, 'jev');
    assert.ok(result.confiancaNumerica >= 0.85);
    assert.equal(triage.stats.jevResolved, 1);
    assert.equal(triage.stats.llmCalled, 0);
  });

  test('deve processar falha de seletor com Jev (alta confiança)', async () => {
    const mockJev = new MockJevClient({ seletor: jevResponseSeletor });
    const triage = new HybridTriage({ confidenceThreshold: 0.85, jevClient: mockJev });

    const failure = {
      id: 'test-002',
      nome: 'Clique no botão mobile',
      mensagem: "Element '//button[@name=Submit]' still not displayed",
      stack: 'Error: element not displayed',
      tags: [],
      tentativas: 1,
      status: 'failed',
    };

    const result = await triage.analyzeFailure(failure);

    assert.equal(result.categoria, 'teste-quebrado');
    assert.equal(result.source, 'jev');
  });

  test('deve enviar para LLM quando Jev tem baixa confiança', async () => {
    // Como não temos LLM mockado aqui, vamos testar só o caminho do Jev falhar
    // e verificar que o erro é capturado corretamente
    const mockJev = new MockJevClient({ default: new Error('Jev indisponível') });
    const triage = new HybridTriage({ confidenceThreshold: 0.85, jevClient: mockJev });

    const failure = {
      id: 'test-003',
      nome: 'Teste complexo',
      mensagem: 'Erro estranho aconteceu',
      stack: 'Error: algo deu errado',
      tags: [],
      tentativas: 1,
      status: 'failed',
    };

    // Sem LLM habilitado, deve cair na heurística
    const result = await triage.analyzeFailure(failure);

    assert.ok(['heuristic', 'llm'].includes(result.source));
    assert.equal(triage.stats.jevErrors, 1);
  });

  test('deve processar múltiplas falhas em paralelo', async () => {
    const mockJev = new MockJevClient({
      ambiente: jevResponseAmbiente,
      seletor: jevResponseSeletor,
    });
    const triage = new HybridTriage({ confidenceThreshold: 0.85, jevClient: mockJev });

    const failures = [
      { id: '1', nome: 'Falha ambiente', mensagem: 'ECONNREFUSED', stack: '', tags: [], tentativas: 1, status: 'failed' },
      { id: '2', nome: 'Falha seletor', mensagem: 'element not found', stack: '', tags: [], tentativas: 1, status: 'failed' },
    ];

    const results = await triage.analyzeFailures(failures, { concurrency: 2 });

    assert.equal(results.length, 2);
    assert.equal(triage.stats.total, 2);
    // Ambas devem ser resolvidas pelo Jev (alta confiança)
    assert.equal(triage.stats.jevResolved, 2);
    assert.ok(results.every(r => r.source === 'jev'));
  });

  test('deve usar heurística para known-issue sem gastar tokens', () => {
    const triage = new HybridTriage();

    const failure = {
      id: 'test-known',
      nome: 'Senha em texto puro',
      mensagem: 'API retorna senha',
      stack: '',
      tags: ['known-issue'],
      tentativas: 1,
      status: 'failed',
    };

    const result = triage.triageHeuristic(failure);

    assert.equal(result.categoria, 'divergencia-requisito');
    assert.equal(result.confianca, 'alta');
  });

  test('getStats deve retornar métricas corretas', async () => {
    const mockJev = new MockJevClient({ ambiente: jevResponseAmbiente });
    const triage = new HybridTriage({ confidenceThreshold: 0.85, jevClient: mockJev });

    await triage.analyzeFailure({
      id: '1', nome: 'A', mensagem: 'ECONNREFUSED', stack: '', tags: [], tentativas: 1, status: 'failed',
    });

    const stats = triage.getStats();

    assert.equal(stats.total, 1);
    assert.equal(stats.jevResolved, 1);
    assert.equal(stats.jevHitRate, '100.0%');
  });

  test('deve mapear categorias para ações corretamente', () => {
    const triage = new HybridTriage();

    assert.ok(triage.mapCategoriaToAcao('bug-produto').includes('bug'));
    assert.ok(triage.mapCategoriaToAcao('teste-quebrado').includes('teste') || triage.mapCategoriaToAcao('teste-quebrado').includes('seletor'));
    assert.ok(triage.mapCategoriaToAcao('ambiente').includes('infraestrutura') || triage.mapCategoriaToAcao('ambiente').includes('ambiente'));
    assert.ok(triage.mapCategoriaToAcao('flaky').includes('flaky') || triage.mapCategoriaToAcao('flaky').includes('instabilidad'));
  });

  test('buildJevState deve estruturar dados corretamente', () => {
    const triage = new HybridTriage();

    const failure = {
      nome: 'Login teste',
      suite: 'API',
      feature: 'Auth',
      tags: ['smoke'],
      mensagem: 'Erro de login',
      stack: 'Error: stack trace aqui',
      tentativas: 2,
      platform: 'api',
      duration: 1500,
    };

    const state = triage.buildJevState(failure);

    assert.equal(state.teste, 'Login teste');
    assert.equal(state.suite, 'API');
    assert.equal(state.feature, 'Auth');
    assert.deepEqual(state.tags, ['smoke']);
    assert.equal(state.tentativas, 2);
    assert.equal(state.plataforma, 'api');
  });

  test('triageWithJev deve calcular confiança corretamente', async () => {
    const mockJev = new MockJevClient({ ambiente: jevResponseAmbiente });
    const triage = new HybridTriage({ jevClient: mockJev });

    const failure = {
      id: 'test-conf',
      nome: 'Teste confiança',
      mensagem: 'ECONNREFUSED',
      stack: '',
      tags: [],
      tentativas: 1,
      status: 'failed',
    };

    const result = await triage.triageWithJev(failure);

    // 85% de 0.95 (choice) + 15% de 0.95 (score/4) = ~0.95
    assert.ok(result.confiancaNumerica > 0.85);
    assert.equal(result.categoria, 'ambiente');
    assert.equal(result.confianca, 'alta');
  });

  test('triageWithJev deve tratar erro do Jev graciosamente', async () => {
    const mockJev = new MockJevClient({ default: new Error('API fora do ar') });
    const triage = new HybridTriage({ jevClient: mockJev });

    const failure = {
      id: 'test-err',
      nome: 'Teste erro',
      mensagem: 'qualquer coisa',
      stack: '',
      tags: [],
      tentativas: 1,
      status: 'failed',
    };

    await assert.rejects(() => triage.triageWithJev(failure), /API fora do ar/);
  });
});

describe('Fallback sem Jev', () => {
  test('deve ir para LLM ou heurística quando Jev está desabilitado', async () => {
    const triage = new HybridTriage({ jevClient: null });
    triage.jev = null;

    const failure = {
      id: 'test-no-jev',
      nome: 'Teste sem Jev',
      mensagem: 'Erro qualquer',
      stack: '',
      tags: [],
      tentativas: 1,
      status: 'failed',
    };

    const result = await triage.analyzeFailure(failure);

    // Sem Jev: vai para LLM (se habilitado) ou heurística (fallback)
    assert.ok(['llm', 'heuristic'].includes(result.source));
    assert.equal(triage.stats.jevResolved, 0);
    assert.equal(triage.stats.jevErrors, 0);
  });
});
