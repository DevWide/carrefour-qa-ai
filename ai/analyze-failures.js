#!/usr/bin/env node
/**
 * IA na ANÁLISE de testes (API e Mobile).
 *
 * Lê um diretório allure-results, coleta as falhas com suas evidências
 * (mensagem, stack, logs de request/response, screenshots) e gera uma triagem:
 * categoria da causa, confiança, evidência e próxima ação.
 *
 * Estratégia híbrida (Jev + LLM):
 * - Jev (TypeSafe AI): triagem rápida e barata (~350ms, custo mínimo).
 *   Casos óbvios são resolvidos sem gastar tokens de LLM.
 * - LLM (OpenAI/Gemini/Claude): análise profunda só para casos incertos.
 * - Heurística: fallback quando nenhuma IA está disponível.
 *
 * Saídas: <out>/ai-triage.md, <out>/ai-triage.json e, no GitHub Actions, o Job Summary.
 *
 * Uso: node analyze-failures.js --results ../api/allure-results --out ../api/ai-triage [--suite API]
 */
import fs from 'node:fs';
import path from 'node:path';
import { isEnabled, MODEL, PROVIDER } from './src/llm.js';
import { HybridTriage } from './src/triage.js';
import { isJevEnabled } from './src/jev.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const RESULTS = path.resolve(arg('results', 'allure-results'));
const OUT = path.resolve(arg('out', 'ai-triage'));
const SUITE = arg('suite', 'Testes');
const MAX_FALHAS = Number(arg('max', 25));
const CONCURRENCY = Number(arg('concurrency', 3));
const here = path.dirname(new URL(import.meta.url).pathname);

// ---------------------------------------------------------------- coleta
function coletarFalhas() {
  if (!fs.existsSync(RESULTS)) throw new Error(`Diretório não encontrado: ${RESULTS}`);
  const arquivos = fs.readdirSync(RESULTS).filter((f) => f.endsWith('-result.json'));
  const resultados = arquivos.map((f) => JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf8')));

  // Retries geram vários resultados para o mesmo teste: fica o último.
  const porTeste = new Map();
  for (const r of resultados.sort((a, b) => a.stop - b.stop)) porTeste.set(r.historyId || r.fullName, r);
  const finais = [...porTeste.values()];

  const falhas = finais
    .filter((r) => ['failed', 'broken'].includes(r.status))
    .map((r) => {
      const label = (n) => r.labels?.filter((l) => l.name === n).map((l) => l.value) ?? [];
      const anexos = coletarAnexos(r);
      return {
        id: r.uuid,
        teste: r.fullName || r.name,
        nome: r.name,
        status: r.status,
        feature: label('feature')[0],
        tags: label('tag'),
        tentativas: resultados.filter((x) => (x.historyId || x.fullName) === (r.historyId || r.fullName)).length,
        mensagem: r.statusDetails?.message?.slice(0, 1500),
        stack: r.statusDetails?.trace?.split('\n').slice(0, 8).join('\n'),
        logs: anexos.logs,
        screenshots: anexos.imagens,
      };
    });

  return { total: finais.length, falhas };
}

function coletarAnexos(result) {
  const logs = [];
  const imagens = [];
  const visitar = (node) => {
    for (const a of node.attachments ?? []) {
      const file = path.join(RESULTS, a.source);
      if (!fs.existsSync(file)) continue;
      if (a.type?.startsWith('image/')) imagens.push({ nome: a.name, type: a.type, file });
      else logs.push({ nome: a.name, conteudo: fs.readFileSync(file, 'utf8').slice(0, 2500) });
    }
    (node.steps ?? []).forEach(visitar);
  };
  visitar(result);
  return { logs: logs.slice(-3), imagens: imagens.slice(-1) };
}

// ---------------------------------------------------------------- triagem heurística para casos conhecidos (não gasta tokens)
function triagemHeuristica(f) {
  const msg = `${f.mensagem ?? ''}\n${f.stack ?? ''}`;
  const regra = (categoria, confianca, justificativa, proximaAcao) => ({ categoria, confianca, justificativa, proximaAcao });

  if (f.tags.includes('known-issue'))
    return regra('divergencia-requisito', 'alta', 'Teste marcado como @known-issue.', 'Acompanhar a correção; nenhuma ação na suíte.');
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|API indisponível|session not created|Could not start a new session/i.test(msg))
    return regra('ambiente', 'alta', 'Erro de conexão/infraestrutura na mensagem.', 'Verificar se a API/Appium/emulador estão no ar e reexecutar.');
  if (f.tentativas > 1 && f.status === 'failed')
    return regra('flaky', 'media', `Falhou em ${f.tentativas} tentativas com retry.`, 'Investigar esperas e dependência de dados entre testes.');
  if (/element .* (still )?not (displayed|existing)|no such element|wasn't found|stale element/i.test(msg))
    return regra('teste-quebrado', 'media', 'Elemento não encontrado — seletor provavelmente mudou.', 'Rodar o self-healing (npm run heal) e revisar o seletor sugerido.');
  if (/schema/i.test(msg))
    return regra('bug-produto', 'media', 'Resposta fora do contrato (JSON Schema).', 'Comparar o corpo anexado com o schema e abrir bug se o contrato não mudou.');
  if (/expected \d{3} to equal \d{3}/.test(msg))
    return regra('bug-produto', 'baixa', 'Status HTTP diferente do esperado.', 'Conferir o log de request/response anexado no Allure.');
  return regra('teste-quebrado', 'baixa', 'Sem padrão conhecido.', 'Analisar manualmente o stack trace e as evidências.');
}

// ---------------------------------------------------------------- relatório
const ICONES = { 'bug-produto': '🐞', 'teste-quebrado': '🔧', ambiente: '🌐', flaky: '🎲', 'divergencia-requisito': '📄', heuristic: '📋', jev: '⚡', llm: '🧠' };
const FONTE_ICONES = { jev: '⚡', llm: '🧠', heuristic: '📋' };

function montarMarkdown({ total, falhas, itens, resumo, modo, stats }) {
  const porCategoria = itens.reduce((acc, i) => ({ ...acc, [i.categoria]: (acc[i.categoria] ?? 0) + 1 }), {});
  const porFonte = itens.reduce((acc, i) => ({ ...acc, [i.source || 'heuristic']: (acc[i.source || 'heuristic'] ?? 0) + 1 }), {});
  const linhas = [
    `## 🤖 Triagem de falhas por IA — ${SUITE}`,
    '',
    `**${total}** testes · **${falhas.length}** falhas · modo: \`${modo}\``,
    '',
  ];
  if (!falhas.length) return [...linhas, '✅ Nenhuma falha para analisar.'].join('\n');

  linhas.push(Object.entries(porCategoria).map(([c, n]) => `${ICONES[c] ?? '•'} ${c}: **${n}**`).join(' · '), '');

  // Mostra a distribuição por fonte (Jev vs LLM vs heurística)
  const fontesTexto = Object.entries(porFonte)
    .map(([f, n]) => `${FONTE_ICONES[f] ?? '•'} ${f}: ${n}`)
    .join(' · ');
  linhas.push(`**Fonte da análise:** ${fontesTexto}`, '');

  if (resumo) linhas.push('### Resumo', '', resumo, '');
  linhas.push('### Falhas', '', '| Teste | Categoria | Conf. | Fonte | Próxima ação |', '|---|---|---|---|---|');
  for (const i of itens) {
    const f = falhas.find((x) => x.id === i.id);
    const celula = (s) => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
    const fonte = FONTE_ICONES[i.source] ?? '';
    const conf = i.confiancaNumerica ? `${i.confianca} (${(i.confiancaNumerica * 100).toFixed(0)}%)` : i.confianca;
    linhas.push(`| ${celula(f?.nome)} | ${ICONES[i.categoria] ?? ''} ${i.categoria} | ${conf} | ${fonte} | ${celula(i.proximaAcao)} |`);
  }
  linhas.push(
    '',
    '<details><summary>Evidências e justificativas</summary>',
    '',
    ...itens.map((i) => {
      const f = falhas.find((x) => x.id === i.id);
      const fonteLabel = i.source === 'jev' ? '⚡ Jev (rápido)' : i.source === 'llm' ? '🧠 LLM (profundo)' : '📋 Heurística';
      return `- **${f?.nome}**${i.grupo ? ` _(grupo: ${i.grupo})_` : ''} _[${fonteLabel}]_\n  - Evidência: ${i.evidencia ?? '—'}\n  - Justificativa: ${i.justificativa}`;
    }),
    '',
    '</details>',
    '',
  );

  // Estatísticas da triagem híbrida
  if (stats) {
    linhas.push(stats, '');
  }

  linhas.push(
    '> A triagem é uma **sugestão** para acelerar a análise. O resultado dos testes (pass/fail) não é alterado pela IA.',
    '> ⚡ = resolvido pelo Jev (rápido, ~350ms) · 🧠 = análise profunda pelo LLM · 📋 = regra heurística',
  );
  return linhas.join('\n');
}

// ---------------------------------------------------------------- main
async function main() {
  const { total, falhas: todas } = coletarFalhas();
  const falhas = todas.slice(0, MAX_FALHAS);

  // Falhas já conhecidas não gastam tokens (heurística direta).
  const conhecidas = falhas.filter((f) => f.tags.includes('known-issue'));
  const paraIA = falhas.filter((f) => !f.tags.includes('known-issue'));

  let itens = conhecidas.map((f) => ({
    id: f.id,
    ...triagemHeuristica(f),
    grupo: 'divergência conhecida',
    evidencia: f.mensagem,
    source: 'heuristic',
  }));
  let resumo = '';

  // Determina o modo de operação
  const jevAtivo = isJevEnabled();
  const llmAtivo = isEnabled();
  let modo = 'heurístico';
  let stats = null;
  let statsJson;

  if (paraIA.length && (jevAtivo || llmAtivo)) {
    // Usa triagem híbrida (Jev + LLM)
    const triage = new HybridTriage();
    modo = jevAtivo && llmAtivo
      ? `híbrido (⚡ Jev + 🧠 ${PROVIDER}/${MODEL})`
      : jevAtivo
        ? 'Jev (TypeSafe AI)'
        : `LLM (${PROVIDER}/${MODEL})`;

    console.log(`\n🔍 Analisando ${paraIA.length} falhas com triagem híbrida (concorrência: ${CONCURRENCY})...\n`);

    try {
      const resultados = await triage.analyzeFailures(paraIA, { concurrency: CONCURRENCY });
      itens = [...itens, ...resultados];
      stats = triage.formatStats();
      statsJson = triage.getStats();

      // Gera resumo aggregated a partir dos resultados
      const grupos = {};
      for (const r of resultados) {
        grupos[r.categoria] = (grupos[r.categoria] || 0) + 1;
      }
      resumo = `**${resultados.length} falhas analisadas.** Principais categorias: ${
        Object.entries(grupos).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n})`).join(', ')
      }. ${triage.stats.jevResolved} resolvidas pelo Jev sem custo de LLM, ${triage.stats.llmCalled} enviadas para análise profunda.`;
    } catch (err) {
      console.warn(`⚠️  Falha na triagem híbrida (${err.message}). Usando heurística.`);
      modo = 'heurístico';
    }
  }

  // Fallback: heurística para o que não foi processado
  if (modo === 'heurístico') {
    itens = [...itens, ...paraIA.map((f) => ({
      id: f.id,
      ...triagemHeuristica(f),
      evidencia: f.mensagem?.split('\n')[0],
      source: 'heuristic',
    }))];
  }

  const md = montarMarkdown({ total, falhas, itens, resumo, modo, stats });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'ai-triage.md'), `${md}\n`);
  fs.writeFileSync(
    path.join(OUT, 'ai-triage.json'),
    `${JSON.stringify({ suite: SUITE, modo, total, itens, stats: statsJson }, null, 2)}\n`
  );
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);

  console.log(md);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
