#!/usr/bin/env node
/**
 * Teste rápido da integração com o Jev (TypeSafe AI).
 *
 * Uso: node test-jev.js
 *
 * Verifica:
 * 1. Se a chave JEV_API_KEY está configurada
 * 2. Se consegue fazer uma chamada de teste ao Jev
 * 3. Se a triagem híbrida está funcionando
 */
import { TypeSafeClient, isJevEnabled, choice, noul, score } from './src/jev.js';
import { HybridTriage } from './src/triage.js';

async function testarConexaoJev() {
  console.log('🧪 Testando conexão com Jev (TypeSafe AI)...\n');

  if (!isJevEnabled()) {
    console.error('❌ JEV_API_KEY não configurada!');
    console.error('   Configure no .env: JEV_API_KEY=jv_live_sua_chave');
    process.exit(1);
  }

  console.log('✅ Chave encontrada: jv_live_...');

  const client = new TypeSafeClient();
  console.log(`✅ Cliente criado (modelo: ${client.model})`);
  console.log(`   Endpoint: ${client.baseUrl}\n`);

  // Teste simples
  console.log('📡 Fazendo chamada de teste...');
  const startTime = Date.now();

  const result = await client.decide({
    state: {
      teste: 'Login com credenciais inválidas',
      erro: 'Expected 401 but got 200',
      stack: 'at Object.assertStatus (test/usuarios/login.spec.js:45:12)',
      plataforma: 'api',
      tentativas: 1,
    },
    questions: {
      categoria: choice('Classifique esta falha de teste', {
        'bug-produto': 'A aplicação retornou comportamento errado',
        'teste-quebrado': 'O teste está errado (asserção, seletor, massa)',
        'ambiente': 'Problema de infraestrutura',
        'flaky': 'Teste instável',
        'divergencia-requisito': 'Comportamento esperado mudou',
      }),
      confianca: score('Qual a confiança nesta classificação?', [
        'muito incerto',
        'incerto',
        'razoável',
        'confiante',
        'muito confiante',
      ]),
      precisa_analise_profunda: noul('Esta falha precisa de análise detalhada por um humano ou LLM?'),
    },
  });

  const duration = Date.now() - startTime;

  console.log(`\n⚡ Resposta em ${duration}ms\n`);
  console.log('📊 Resultado:');
  console.log(`   Modelo: ${result.model}`);
  console.log(`   Categoria: ${result.answers.categoria?.choice}`);
  console.log(`   Confiança (choice): ${result.answers.categoria?.confidence}`);
  console.log(`   Score confiança: ${JSON.stringify(result.answers.confianca)}`);
  console.log(`   Precisa LLM: ${JSON.stringify(result.answers.precisa_analise_profunda)}`);
  console.log(`   Tokens usados: ${JSON.stringify(result.usage)}`);
  console.log('\n   Distribuição de probabilidades:');
  const probs = result.answers.categoria?.probabilities || {};
  for (const [cat, prob] of Object.entries(probs)) {
    console.log(`     ${cat}: ${prob} (${(prob * 100).toFixed(1)}%)`);
  }

  // Log completo para debug
  console.log('\n🔍 Estrutura completa da resposta (debug):');
  console.log(JSON.stringify(result, null, 2));

  return result;
}

async function testarTriagemHibrida() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testando Triagem Híbrida (Jev + LLM fallback)...\n');

  const triage = new HybridTriage({ confidenceThreshold: 0.85 });

  // Simula algumas falhas de teste
  const falhasSimuladas = [
    {
      id: 'test-001',
      nome: 'Login com credenciais válidas',
      mensagem: 'ECONNREFUSED 127.0.0.1:3000 - Connect ECONNREFUSED',
      stack: 'Error: connect ECONNREFUSED\n    at TCPConnectWrap.afterConnect [as oncomplete]',
      tags: [],
      tentativas: 1,
      status: 'failed',
      feature: 'Login',
    },
    {
      id: 'test-002',
      nome: 'Cadastro com email duplicado',
      mensagem: 'expected 400 to equal 201',
      stack: 'AssertionError: expected 400 to equal 201\n    at Context.<anonymous> (test/usuarios/cadastrar.spec.js:78:5)',
      tags: [],
      tentativas: 3,
      status: 'failed',
      feature: 'Cadastro',
    },
    {
      id: 'test-003',
      nome: 'Clique no botão de submit do formulário mobile',
      mensagem: "Element '//XCUIElementTypeButton[@name=Submit]' still not displayed after 5000ms",
      stack: 'Error: element not displayed\n    at MobilePage.clickSubmit (mobile/test/pageobjects/form.page.js:34:12)',
      tags: [],
      tentativas: 1,
      status: 'failed',
      feature: 'Formulários',
      platform: 'ios',
    },
    {
      id: 'test-004',
      nome: 'Teste conhecido: senha em texto puro',
      mensagem: 'A API retorna senha em texto plano no GET /usuarios',
      stack: '',
      tags: ['known-issue'],
      tentativas: 1,
      status: 'failed',
      feature: 'Segurança',
    },
  ];

  console.log(`Analisando ${falhasSimuladas.length} falhas simuladas...\n`);

  const resultados = await triage.analyzeFailures(falhasSimuladas, { concurrency: 2 });

  console.log('\n📋 Resultados:');
  for (const r of resultados) {
    const failure = falhasSimuladas.find(f => f.id === r.id);
    console.log(`\n  ${failure?.nome}`);
    console.log(`    Categoria: ${r.categoria} (${r.confianca})`);
    console.log(`    Fonte: ${r.source} ${r.source === 'jev' ? '⚡' : r.source === 'llm' ? '🧠' : '📋'}`);
    if (r.confiancaNumerica) {
      console.log(`    Confiança numérica: ${(r.confiancaNumerica * 100).toFixed(1)}%`);
    }
    console.log(`    Próxima ação: ${r.proximaAcao?.slice(0, 80)}...`);
    console.log(`    Duração: ${r.durationMs}ms`);
  }

  console.log(triage.formatStats());
}

async function main() {
  try {
    await testarConexaoJev();
    await testarTriagemHibrida();
    console.log('\n✅ Todos os testes passaram!');
  } catch (err) {
    console.error('\n❌ Erro:', err.message);
    if (err.status) {
      console.error(`   Status HTTP: ${err.status}`);
      console.error(`   Body: ${err.body}`);
    }
    process.exit(1);
  }
}

main();
