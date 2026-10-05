#!/usr/bin/env node
/**
 * IA na ANÁLISE de testes (API e Mobile).
 *
 * Lê um diretório allure-results, coleta as falhas com suas evidências
 * (mensagem, stack, logs de request/response, screenshots) e gera uma triagem:
 * categoria da causa, confiança, evidência e próxima ação.
 *
 * - Com chave de IA (Gemini ou Claude): triagem pelo LLM (multimodal — screenshots do mobile vão como imagem).
 * - Sem chave: triagem heurística por regras, para o relatório nunca ficar vazio.
 *
 * Saídas: <out>/ai-triage.md, <out>/ai-triage.json e, no GitHub Actions, o Job Summary.
 *
 * Uso: node analyze-failures.js --results ../api/allure-results --out ../api/ai-triage [--suite API]
 */
import fs from 'node:fs';
import path from 'node:path';
import { isEnabled, structuredCall, text, image, MODEL, PROVIDER } from './src/llm.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const RESULTS = path.resolve(arg('results', 'allure-results'));
const OUT = path.resolve(arg('out', 'ai-triage'));
const SUITE = arg('suite', 'Testes');
const MAX_FALHAS = Number(arg('max', 25));
const MAX_IMAGENS = 5;
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

// ---------------------------------------------------------------- triagem heurística (fallback)
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
    return regra('teste-quebrado', 'media', 'Elemento não encontrado — seletor provavelmente mudou.', 'Rodar o self-healing (npm run ai:heal) e revisar o seletor sugerido.');
  if (/schema/i.test(msg))
    return regra('bug-produto', 'media', 'Resposta fora do contrato (JSON Schema).', 'Comparar o corpo anexado com o schema e abrir bug se o contrato não mudou.');
  if (/expected \d{3} to equal \d{3}/.test(msg))
    return regra('bug-produto', 'baixa', 'Status HTTP diferente do esperado.', 'Conferir o log de request/response anexado no Allure.');
  return regra('teste-quebrado', 'baixa', 'Sem padrão conhecido.', 'Analisar manualmente o stack trace e as evidências.');
}

// ---------------------------------------------------------------- triagem por IA
const schemaTriagem = {
  type: 'object',
  required: ['resumo', 'itens'],
  properties: {
    resumo: { type: 'string', description: 'Dois a quatro parágrafos curtos: o que falhou, causas principais, o que fazer primeiro.' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'categoria', 'confianca', 'grupo', 'evidencia', 'justificativa', 'proximaAcao'],
        properties: {
          id: { type: 'string' },
          categoria: { type: 'string', enum: ['bug-produto', 'teste-quebrado', 'ambiente', 'flaky', 'divergencia-requisito'] },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          grupo: { type: 'string', description: 'Rótulo curto da causa-raiz compartilhada' },
          evidencia: { type: 'string' },
          justificativa: { type: 'string' },
          proximaAcao: { type: 'string' },
        },
      },
    },
  },
};

async function triagemIA(falhas) {
  const system = fs.readFileSync(path.join(here, 'prompts/analyze-failures.md'), 'utf8');
  const content = [text(`Suíte: ${SUITE}. Falhas a analisar: ${falhas.length}.`)];
  let imagens = 0;

  for (const f of falhas) {
    const { screenshots, ...semImagem } = f;
    content.push(text(`<falha id="${f.id}">\n${JSON.stringify(semImagem, null, 2)}\n</falha>`));
    for (const s of screenshots) {
      if (imagens >= MAX_IMAGENS) break;
      content.push(text(`Screenshot da falha ${f.id} (${s.nome}):`));
      content.push(image(fs.readFileSync(s.file).toString('base64'), s.type));
      imagens += 1;
    }
  }

  return structuredCall({ system, content, toolName: 'registrar_triagem', schema: schemaTriagem });
}

// ---------------------------------------------------------------- relatório
const ICONES = { 'bug-produto': '🐞', 'teste-quebrado': '🔧', ambiente: '🌐', flaky: '🎲', 'divergencia-requisito': '📄' };

function montarMarkdown({ total, falhas, itens, resumo, modo }) {
  const porCategoria = itens.reduce((acc, i) => ({ ...acc, [i.categoria]: (acc[i.categoria] ?? 0) + 1 }), {});
  const linhas = [
    `## 🤖 Triagem de falhas por IA — ${SUITE}`,
    '',
    `**${total}** testes · **${falhas.length}** falhas · modo: \`${modo}\``,
    '',
  ];
  if (!falhas.length) return [...linhas, '✅ Nenhuma falha para analisar.'].join('\n');

  linhas.push(Object.entries(porCategoria).map(([c, n]) => `${ICONES[c] ?? '•'} ${c}: **${n}**`).join(' · '), '');
  if (resumo) linhas.push('### Resumo', '', resumo, '');
  linhas.push('### Falhas', '', '| Teste | Categoria | Confiança | Próxima ação |', '|---|---|---|---|');
  for (const i of itens) {
    const f = falhas.find((x) => x.id === i.id);
    const celula = (s) => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
    linhas.push(`| ${celula(f?.nome)} | ${ICONES[i.categoria] ?? ''} ${i.categoria} | ${i.confianca} | ${celula(i.proximaAcao)} |`);
  }
  linhas.push(
    '',
    '<details><summary>Evidências e justificativas</summary>',
    '',
    ...itens.map((i) => {
      const f = falhas.find((x) => x.id === i.id);
      return `- **${f?.nome}**${i.grupo ? ` _(grupo: ${i.grupo})_` : ''}\n  - Evidência: ${i.evidencia ?? '—'}\n  - Justificativa: ${i.justificativa}`;
    }),
    '',
    '</details>',
    '',
    '> A triagem é uma **sugestão** para acelerar a análise. O resultado dos testes (pass/fail) não é alterado pela IA.',
  );
  return linhas.join('\n');
}

// ---------------------------------------------------------------- main
async function main() {
  const { total, falhas: todas } = coletarFalhas();
  const falhas = todas.slice(0, MAX_FALHAS);

  // Falhas já conhecidas não gastam tokens.
  const conhecidas = falhas.filter((f) => f.tags.includes('known-issue'));
  const paraIA = falhas.filter((f) => !f.tags.includes('known-issue'));

  let itens = conhecidas.map((f) => ({ id: f.id, ...triagemHeuristica(f), grupo: 'divergência conhecida', evidencia: f.mensagem }));
  let resumo = '';
  let modo = 'heurístico';

  if (paraIA.length && isEnabled()) {
    try {
      const { data, usage } = await triagemIA(paraIA);
      itens = [...itens, ...data.itens];
      resumo = data.resumo;
      modo = `IA (${PROVIDER} · ${MODEL}, ${usage.input}+${usage.output} tokens)`;
    } catch (err) {
      console.warn(`⚠️  Falha na chamada ao LLM (${err.message}). Usando triagem heurística.`);
    }
  }
  if (modo === 'heurístico') {
    itens = [...itens, ...paraIA.map((f) => ({ id: f.id, ...triagemHeuristica(f), evidencia: f.mensagem?.split('\n')[0] }))];
  }

  const md = montarMarkdown({ total, falhas, itens, resumo, modo });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'ai-triage.md'), `${md}\n`);
  fs.writeFileSync(path.join(OUT, 'ai-triage.json'), `${JSON.stringify({ suite: SUITE, modo, total, itens }, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);

  console.log(md);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
