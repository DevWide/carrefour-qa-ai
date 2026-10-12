/**
 * Triagem híbrida de falhas: Jev (rápido/barato) + LLM (preciso/caro).
 *
 * Fluxo:
 * 1. Jev faz a triagem inicial de cada falha (~50ms, custo mínimo).
 * 2. Se a confiança do Jev for >= threshold, aceita a classificação (economiza LLM).
 * 3. Se a confiança for baixa, envia para o LLM com o contexto do Jev como "dica".
 *
 * Isso reduz drasticamente o uso de tokens do LLM: apenas falhas incertas
 * (que realmente precisam de análise profunda) são enviadas.
 *
 * Uso:
 *   import { HybridTriage } from './triage.js';
 *   const triage = new HybridTriage();
 *   const result = await triage.analyzeFailure(failure);
 */
import { TypeSafeClient, isJevEnabled, choice, score, noul } from './jev.js';
import { structuredCall, isEnabled, text, MODEL, PROVIDER } from './llm.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Categorias de triagem (mesmas do schema do LLM)
const CATEGORIAS = ['bug-produto', 'teste-quebrado', 'ambiente', 'flaky', 'divergencia-requisito'];
const CATEGORIA_DESCRICOES = {
  'bug-produto': 'A aplicação tem um bug real — comportamento errado do produto',
  'teste-quebrado': 'O teste precisa ser corrigido — seletor quebrado, massa de dados, espera',
  'ambiente': 'Problema de infraestrutura — API fora do ar, emulador, Appium, rede',
  'flaky': 'Teste instável — passa e falha intermitentemente',
  'divergencia-requisito': 'Comportamento esperado difere do requisito — conhecido ou não',
};

const CONFIAVEL_PARA_LLM = {
  'alta': 'alta (>0.8)',
  'media': 'média (0.5-0.8)',
  'baixa': 'baixa (<0.5)',
};

function confiancaParaScore(conf) {
  // Mapeia confiança do Jev (0-1) para alta/media/baixa
  if (conf >= 0.8) return 'alta';
  if (conf >= 0.5) return 'media';
  return 'baixa';
}

/**
 * Classe principal da triagem híbrida.
 */
export class HybridTriage {
  constructor({
    // Threshold padrão: 0.75 (75%) — equilíbrio entre precisão e economia.
    // Casos óbvios (ECONNREFUSED, elemento não encontrado) обычно têm >90%.
    // Casos ambíguos ficam abaixo de 70% e vão para o LLM.
    confidenceThreshold = Number(process.env.JEV_CONFIDENCE_THRESHOLD) || 0.75,
    jevClient = null,
  } = {}) {
    this.confidenceThreshold = confidenceThreshold;
    this.jev = jevClient || (isJevEnabled() ? new TypeSafeClient() : null);

    // Métricas para relatório
    this.stats = {
      total: 0,
      jevResolved: 0,
      llmCalled: 0,
      heuristicUsed: 0,
      jevErrors: 0,
      llmErrors: 0,
      jevTokens: 0,
      llmTokens: { input: 0, output: 0 },
      startTime: Date.now(),
    };
  }

  /**
   * Analisa uma única falha usando a estratégia híbrida.
   *
   * @param {object} failure - Dados da falha (id, nome, mensagem, stack, etc.)
   * @returns {Promise<object>} Resultado da triagem
   */
  async analyzeFailure(failure) {
    this.stats.total++;
    const startTime = Date.now();

    // 1. Tenta com Jev primeiro (se disponível)
    if (this.jev) {
      try {
        const jevResult = await this.triageWithJev(failure);
        this.stats.jevTokens += jevResult.usage?.input_tokens || 0;

        // Usa a confiança numérica retornada pelo Jev
        const confiancaJev = jevResult.confiancaNumerica || 0;

        // Se confiança alta, aceita direto (economiza LLM!)
        if (confiancaJev >= this.confidenceThreshold) {
          this.stats.jevResolved++;
          return {
            id: failure.id,
            ...jevResult,
            source: 'jev',
            durationMs: Date.now() - startTime,
          };
        }

        // Confiança baixa → vai para LLM com dica do Jev
        console.log(`  [Jev] Baixa confiança (${(confiancaJev * 100).toFixed(1)}%) para ${failure.nome?.slice(0, 50)}... → LLM`);
        const llmResult = await this.triageWithLLM(failure, jevResult);
        this.stats.llmCalled++;
        this.stats.llmTokens.input += llmResult.usage?.input || 0;
        this.stats.llmTokens.output += llmResult.usage?.output || 0;

        return {
          id: failure.id,
          ...llmResult,
          jevTriage: jevResult,
          source: 'llm',
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        this.stats.jevErrors++;
        console.warn(`  ⚠️  Erro no Jev: ${err.message}. Tentando LLM...`);
        // Continua para o LLM como fallback
      }
    }

    // 2. Fallback: LLM direto (sem Jev ou Jev falhou)
    if (isEnabled()) {
      try {
        const llmResult = await this.triageWithLLM(failure, null);
        this.stats.llmCalled++;
        this.stats.llmTokens.input += llmResult.usage?.input || 0;
        this.stats.llmTokens.output += llmResult.usage?.output || 0;

        return {
          id: failure.id,
          ...llmResult,
          source: 'llm',
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        this.stats.llmErrors++;
        console.warn(`  ⚠️  Erro no LLM: ${err.message}. Usando heurística.`);
      }
    }

    // 3. Último fallback: heurística (sem IA)
    this.stats.heuristicUsed++;
    return {
      id: failure.id,
      ...this.triageHeuristic(failure),
      source: 'heuristic',
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Analisa múltiplas falhas em paralelo (com limite de concorrência).
   */
  async analyzeFailures(failures, { concurrency = 3 } = {}) {
    const results = [];
    const queue = [...failures];

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const failure = queue.shift();
        const result = await this.analyzeFailure(failure);
        results.push(result);
      }
    });

    await Promise.all(workers);
    return results;
  }

  /**
   * Triagem usando o Jev (modelo discriminativo rápido).
   */
  async triageWithJev(failure) {
    try {
      const state = this.buildJevState(failure);

      const questions = {
        categoria: choice(
          'Classifique a causa raiz desta falha de teste de software',
          Object.fromEntries(
            CATEGORIAS.map((c) => [c, CATEGORIA_DESCRICOES[c]])
          )
        ),
        confianca: score(
          'Qual a confiança nesta classificação?',
          ['muito incerto', 'incerto', 'razoável', 'confiante', 'muito confiante']
        ),
        precisa_llm: noul(
          'Esta falha precisa de análise profunda por um LLM? Considere: é um caso novo, complexo, ou ambíguo?'
        ),
      };

      const { answers, usage, model } = await this.jev.decide({ state, questions });

      // Debug: log da estrutura completa (útil para ajustar o parsing)
      if (process.env.JEV_DEBUG === 'true') {
        console.log('📦 Jev raw answers:', JSON.stringify(answers, null, 2));
      }

      // Helper ultra-seguro para converter qualquer coisa em número válido 0-1
      const toConfidence = (val, fallback = 0.5) => {
        if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
          return Math.min(Math.max(val, 0), 1);
        }
        return fallback;
      };

      // Helper para formatar número com segurança
      const safeFixed = (val, decimals = 1) => {
        const num = toConfidence(val, 0);
        return (num * (decimals === 1 ? 100 : Math.pow(10, decimals))).toFixed(decimals === 1 ? 1 : decimals);
      };

      // Extrai resultados com fallbacks seguros
      const categoria = (answers && answers.categoria && answers.categoria.choice) || 'teste-quebrado';
      const confiancaScoreRaw = answers && answers.confianca ? answers.confianca.score : undefined;
      const confiancaScoreMeta = answers && answers.confianca ? answers.confianca.confidence : undefined;
      const probabilidadeCategorias = (answers && answers.categoria && answers.categoria.probabilities) || {};

      // Score vem como número contínuo (0.0 a 4.0). Normaliza para 0-1.
      let confiancaScore = 0.5;
      if (typeof confiancaScoreRaw === 'number' && !isNaN(confiancaScoreRaw)) {
        confiancaScore = Math.min(Math.max(confiancaScoreRaw / 4, 0), 1);
      }

      // Confiança da escolha (choice) — deve vir como 0-1
      let confiancaChoice = 0.5;
      if (answers && answers.categoria && typeof answers.categoria.confidence === 'number') {
        confiancaChoice = Math.min(Math.max(answers.categoria.confidence, 0), 1);
      } else if (probabilidadeCategorias[categoria] !== undefined) {
        const prob = probabilidadCategorias[categoria];
        if (typeof prob === 'number' && !isNaN(prob)) {
          confiancaChoice = Math.min(Math.max(prob, 0), 1);
        }
      }

      // Se ainda não temos confiança válida, pega a maior probabilidade
      if (confiancaChoice === 0.5) {
        const probs = Object.values(probabilidadeCategorias)
          .filter(p => typeof p === 'number' && !isNaN(p));
        if (probs.length > 0) {
          confiancaChoice = Math.min(Math.max(Math.max(...probs), 0), 1);
        }
      }

      // Metaconfiança do score (calibração do próprio score, para debug)
      let scoreMetaConfianca = 0.5;
      if (typeof confiancaScoreMeta === 'number' && !isNaN(confiancaScoreMeta)) {
        scoreMetaConfianca = Math.min(Math.max(confiancaScoreMeta, 0), 1);
      }

      // Confiança final baseada principalmente na confiança da escolha (choice)
      // A confiança do score é secundária — ela mede a distribuição do score,
      // não diretamente a confiança na classificação.
      //
      // Fórmula: 85% confiança da choice + 15% confiança do score (peso baixo)
      // Isso garante que casos óbvios (choice=0.95+) passem fácil,
      // e casos incertos (choice=0.6-0.7) fiquem abaixo do threshold.
      const confiancaFinal = Math.min(
        Math.max((confiancaChoice * 0.85) + (confiancaScore * 0.15), 0),
        1
      );

      // Formata a confiança como porcentagem para exibição (seguro)
      const confiancaPercentual = `${(confiancaFinal * 100).toFixed(1)}%`;

      return {
        categoria,
        confianca: confiancaParaScore(confiancaFinal),
        confiancaNumerica: Number(confiancaFinal.toFixed(3)),
        grupo: this.inferGrupo(failure, categoria),
        evidencia: this.extractEvidence(failure),
        justificativa: `Classificado por Jev (${model}) com ${confiancaPercentual} de confiança. Distribuição: ${JSON.stringify(probabilidadeCategorias)}`,
        proximaAcao: this.mapCategoriaToAcao(categoria),
        distribution: probabilidadeCategorias,
        scoreDetalhado: {
          choice: Number(confiancaChoice.toFixed(3)),
          scoreRaw: confiancaScoreRaw,
          scoreNormalizado: Number(confiancaScore.toFixed(3)),
          metaConfianca: Number(scoreMetaConfianca.toFixed(3)),
        },
        usage: { input_tokens: (usage && usage.input_tokens) || (usage && usage.input) || 0 },
      };
    } catch (err) {
      console.error('❌ Erro detalhado no triageWithJev:', err.message);
      console.error('Stack:', err.stack);
      throw err;
    }
  }

  /**
   * Constrói o estado (contexto) para o Jev avaliar.
   */
  buildJevState(failure) {
    return {
      teste: failure.nome,
      suite: failure.suite || 'não informado',
      feature: failure.feature,
      tags: failure.tags,
      mensagem_erro: (failure.mensagem || '').slice(0, 800),
      stack_trace: (failure.stack || '').slice(0, 500),
      tentativas: failure.tentativas,
      plataforma: failure.platform,
      duracao_ms: failure.duration,
    };
  }

  /**
   * Triagem usando LLM (fallback quando Jev não tem confiança).
   */
  async triageWithLLM(failure, jevHint) {
    const system = fs.readFileSync(path.join(here, '../prompts/analyze-failures.md'), 'utf8');

    let hintText = '';
    if (jevHint) {
      hintText = `\n\nDICA DO JEV (triagem rápida, baixa confiança):\n` +
        `- Categoria sugerida: ${jevHint.categoria} (confiança: ${jevHint.confiancaNumerica?.toFixed(2)})\n` +
        `- Distribuição: ${JSON.stringify(jevHint.distribution)}\n` +
        `Use essa dica como ponto de partida, mas faça sua própria análise.`;
    }

    const content = [
      text(`<falha id="${failure.id}"${jevHint ? ' prioridade="alta"' : ''}>` +
        `\n${JSON.stringify({ ...failure, screenshots: undefined }, null, 2)}` +
        `\n</falha>${hintText}`),
    ];

    // Adiciona screenshots se houver (limite de 1 por falha para economizar)
    if (failure.screenshots?.length > 0) {
      const s = failure.screenshots[0];
      const { image } = await import('./llm.js');
      content.push(text(`Screenshot da falha ${failure.id}:`));
      content.push(image(fs.readFileSync(s.file).toString('base64'), s.type));
    }

    const schema = {
      type: 'object',
      required: ['categoria', 'confianca', 'grupo', 'evidencia', 'justificativa', 'proximaAcao'],
      properties: {
        categoria: { type: 'string', enum: CATEGORIAS },
        confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        grupo: { type: 'string' },
        evidencia: { type: 'string' },
        justificativa: { type: 'string' },
        proximaAcao: { type: 'string' },
      },
    };

    const { data, usage } = await structuredCall({
      system,
      content,
      toolName: 'registrar_triagem',
      schema,
    });

    return {
      ...data,
      usage: { input: usage.input, output: usage.output },
    };
  }

  /**
   * Triagem heurística (fallback sem IA).
   */
  triageHeuristic(failure) {
    const msg = `${failure.mensagem ?? ''}\n${failure.stack ?? ''}`;

    if (failure.tags?.includes('known-issue')) {
      return {
        categoria: 'divergencia-requisito',
        confianca: 'alta',
        grupo: 'divergência conhecida',
        evidencia: failure.mensagem,
        justificativa: 'Teste marcado como @known-issue.',
        proximaAcao: 'Acompanhar a correção; nenhuma ação na suíte.',
      };
    }
    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|session not created/i.test(msg)) {
      return {
        categoria: 'ambiente',
        confianca: 'alta',
        grupo: 'infraestrutura',
        evidencia: 'Erro de conexão na mensagem.',
        justificativa: 'Erro clássica de infraestrutura.',
        proximaAcao: 'Verificar se API/Appium/emulador estão no ar e reexecutar.',
      };
    }
    if (failure.tentativas > 1 && failure.status === 'failed') {
      return {
        categoria: 'flaky',
        confianca: 'media',
        grupo: 'instabilidade',
        evidencia: `Falhou em ${failure.tentativas} tentativas.`,
        justificativa: 'Retry indica instabilidade.',
        proximaAcao: 'Investigar esperas e dependência de dados entre testes.',
      };
    }
    if (/element .* not (displayed|existing)|no such element|stale element/i.test(msg)) {
      return {
        categoria: 'teste-quebrado',
        confianca: 'media',
        grupo: 'seletor',
        evidencia: 'Elemento não encontrado.',
        justificativa: 'Seletor provavelmente mudou.',
        proximaAcao: 'Rodar o self-healing e revisar o seletor sugerido.',
      };
    }
    return {
      categoria: 'teste-quebrado',
      confianca: 'baixa',
      grupo: 'genérico',
      evidencia: failure.mensagem?.split('\n')[0] || '—',
      justificativa: 'Sem padrão conhecido.',
      proximaAcao: 'Analisar manualmente o stack trace e as evidências.',
    };
  }

  inferGrupo(failure, categoria) {
    const msg = `${failure.mensagem ?? ''}`.toLowerCase();
    if (categoria === 'ambiente') return 'infraestrutura';
    if (categoria === 'teste-quebrado') {
      if (/element|seletor|locator/i.test(msg)) return 'seletor';
      if (/timeout|espera/i.test(msg)) return 'espera';
      return 'teste';
    }
    if (categoria === 'bug-produto') return 'produto';
    if (categoria === 'flaky') return 'instabilidade';
    return 'outros';
  }

  extractEvidence(failure) {
    if (failure.mensagem) return failure.mensagem.split('\n')[0].slice(0, 200);
    if (failure.stack) return failure.stack.split('\n')[0].slice(0, 200);
    return '—';
  }

  mapCategoriaToAcao(categoria) {
    const acoes = {
      'bug-produto': 'Abrir bug para equipe de desenvolvimento com as evidências anexadas.',
      'teste-quebrado': 'Corrigir o teste: revisar seletor, massa de dados ou esperas. Considere rodar o self-healing.',
      'ambiente': 'Verificar infraestrutura (API, emulador, Appium, rede) e reexecutar o pipeline.',
      'flaky': 'Marcar como flaky, investigar estabilidad e (esperas, dados compartilhados, ordem).',
      'divergencia-requisito': 'Revisar requisito vs comportamento atual. Se confirmado, abrir bug ou atualizar expectativa.',
    };
    return acoes[categoria] || 'Revisar manualmente.';
  }

  /**
   * Retorna estatísticas da execução para relatório.
   */
  getStats() {
    const duration = Date.now() - this.stats.startTime;
    const jevHitRate = this.stats.total > 0
      ? ((this.stats.jevResolved / this.stats.total) * 100).toFixed(1)
      : '0.0';

    // Estimativa de economia (assume LLM médio de $0.00015/1k input + $0.0006/1k output)
    const llmCostPerFailure = 0.001; // ~$0.001 por análise LLM média
    const estimatedLlmCost = this.stats.total * llmCostPerFailure;
    const actualLlmCost = this.stats.llmCalled * llmCostPerFailure;
    const savings = estimatedLlmCost - actualLlmCost;

    return {
      ...this.stats,
      durationMs: duration,
      jevHitRate: `${jevHitRate}%`,
      llmCallRate: `${((this.stats.llmCalled / Math.max(this.stats.total, 1)) * 100).toFixed(1)}%`,
      estimatedSavingsUSD: savings.toFixed(4),
      estimatedSavingsPercent: this.stats.total > 0
        ? `${(((this.stats.total - this.stats.llmCalled) / this.stats.total) * 100).toFixed(1)}%`
        : '0%',
    };
  }

  /**
   * Formata as estatísticas para exibição no console/relatório.
   */
  formatStats() {
    const s = this.getStats();
    return [
      '',
      '## 📊 Estatísticas da Triagem Híbrida (Jev + LLM)',
      '',
      `| Métrica | Valor |`,
      `|---|---|`,
      `| Total de falhas | ${s.total} |`,
      `| Resolvidas pelo Jev (sem LLM) | ${s.jevResolved} (${s.jevHitRate}) |`,
      `| Enviadas para LLM | ${s.llmCalled} (${s.llmCallRate}) |`,
      `| Fallback heurístico | ${s.heuristicUsed} |`,
      `| Erros no Jev | ${s.jevErrors} |`,
      `| Erros no LLM | ${s.llmErrors} |`,
      `| Tokens Jev (input) | ${s.jevTokens} |`,
      `| Tokens LLM (input+output) | ${s.llmTokens.input}+${s.llmTokens.output} |`,
      `| Tempo total | ${(s.durationMs / 1000).toFixed(1)}s |`,
      `| Economia estimada vs só LLM | $${s.estimatedSavingsUSD} (${s.estimatedSavingsPercent}) |`,
      '',
    ].join('\n');
  }
}
