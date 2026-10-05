#!/usr/bin/env node
/**
 * IA na MANUTENÇÃO de testes (Mobile) — self-healing ASSISTIDO de seletores.
 *
 * Por que "assistido" e não automático em tempo de execução?
 *   Se o teste se "curasse" sozinho durante a execução, uma regressão real (botão sumiu da tela)
 *   poderia passar despercebida. Aqui o teste falha normalmente; depois, este script propõe a correção
 *   com evidência, valida a sugestão contra o page source real e um humano decide aplicar.
 *
 * Fluxo:
 *  1. Lê mobile/evidence/failures.jsonl (gravado pelo afterTest do WebdriverIO).
 *  2. Extrai o seletor que falhou e descobre a chave dele em mobile/test/locators.json.
 *  3. Pede ao LLM o seletor equivalente (page source resumido + screenshot). Sem chave de API: heurística de similaridade.
 *  4. VALIDA cada sugestão contra o page source (a sugestão precisa existir na tela).
 *  5. Gera mobile/ai-heal/heal-report.md e locators.patch.json.  Com --apply, grava as sugestões válidas em locators.json.
 *
 * Uso: node self-heal.js [--apply] [--evidence ../mobile/evidence]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEnabled, structuredCall, text, image, MODEL, PROVIDER } from './src/llm.js';
import { summarize, validateSelector } from './src/page-source.js';
import { extrairSeletor, encontrarChave, sugestaoHeuristica } from './src/heal.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const APPLY = process.argv.includes('--apply');
const EVIDENCE = path.resolve(arg('evidence', path.join(here, '../mobile/evidence')));
const LOCATORS = path.resolve(arg('locators', path.join(here, '../mobile/test/locators.json')));
const OUT = path.resolve(arg('out', path.join(here, '../mobile/ai-heal')));

// ------------------------------------------------------------ 3b. IA
const schemaHeal = {
  type: 'object',
  required: ['diagnostico', 'justificativa'],
  properties: {
    diagnostico: { type: 'string', enum: ['seletor-alterado', 'tela-errada', 'elemento-ausente'] },
    seletorSugerido: { type: 'string', description: 'Seletor WebdriverIO (ex.: ~login-email, id=..., //xpath). Omitir se não for seletor-alterado.' },
    confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    justificativa: { type: 'string' },
    alternativasDescartadas: { type: 'array', items: { type: 'string' } },
  },
};

async function sugestaoIA({ chave, seletorAtual, platform, xml, screenshotFile, teste, erro }) {
  const system = fs.readFileSync(path.join(here, 'prompts/self-heal.md'), 'utf8');
  const content = [
    text(`Teste: ${teste}\nPlataforma: ${platform}\nChave do seletor: ${chave}\nSeletor atual (falhou): ${seletorAtual}\nErro: ${erro}`),
    text(`<page_source_resumido>\n${summarize(xml, platform).slice(0, 60000)}\n</page_source_resumido>`),
  ];
  if (screenshotFile && fs.existsSync(screenshotFile)) {
    content.push(text('Screenshot da tela no momento da falha:'), image(fs.readFileSync(screenshotFile).toString('base64')));
  }
  const { data } = await structuredCall({ system, content, toolName: 'registrar_sugestao', schema: schemaHeal, maxTokens: 2000 });
  return data;
}

// ------------------------------------------------------------ main
async function main() {
  const falhasFile = path.join(EVIDENCE, 'failures.jsonl');
  if (!fs.existsSync(falhasFile)) {
    console.log('✅ Nenhuma falha registrada (evidence/failures.jsonl não existe). Nada a curar.');
    return;
  }
  const repo = JSON.parse(fs.readFileSync(LOCATORS, 'utf8'));
  const falhas = fs.readFileSync(falhasFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const modo = isEnabled() ? `IA (${PROVIDER} · ${MODEL})` : 'heurístico (sem chave de IA)';
  console.log(`🩺 Analisando ${falhas.length} falha(s) — modo ${modo}\n`);

  const resultados = [];
  const vistos = new Set();
  for (const f of falhas) {
    const seletor = extrairSeletor(f.erro);
    const achado = seletor && encontrarChave(repo, seletor, f.plataforma);
    const base = { teste: f.teste, plataforma: f.plataforma, erro: f.erro?.split('\n')[0] };

    if (!seletor || !achado) {
      resultados.push({ ...base, diagnostico: 'nao-e-seletor', justificativa: 'A falha não foi causada por elemento não encontrado (ex.: asserção de valor). Fora do escopo do self-healing.' });
      continue;
    }
    const { chave, vars } = achado;
    const bruto = repo[chave];
    const templateAtual = typeof bruto === 'string' ? bruto : bruto[f.plataforma];
    const seletorAtual = Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), templateAtual);
    const idUnico = `${chave}|${f.plataforma}`;
    if (vistos.has(idUnico)) continue; // mesma chave quebrada em vários testes → uma sugestão só
    vistos.add(idUnico);

    const xml = f.pageSource && fs.existsSync(path.join(EVIDENCE, f.pageSource)) ? fs.readFileSync(path.join(EVIDENCE, f.pageSource), 'utf8') : null;
    if (!xml) {
      resultados.push({ ...base, chave, seletorAtual, diagnostico: 'sem-evidencia', justificativa: 'Page source não foi capturado.' });
      continue;
    }

    // Tela onde o elemento deveria estar (ex.: login.email → login.screen), usada para detectar "tela errada".
    const telaBruta = repo[`${chave.split('.')[0]}.screen`];
    const telaEsperada = typeof telaBruta === 'string' ? telaBruta : telaBruta?.[f.plataforma];
    let s;
    try {
      s = isEnabled()
        ? await sugestaoIA({ chave, seletorAtual, platform: f.plataforma, xml, screenshotFile: path.join(EVIDENCE, f.screenshot), teste: f.teste, erro: f.erro })
        : sugestaoHeuristica({ seletorAtual, xml, platform: f.plataforma, telaEsperada });
    } catch (err) {
      console.warn(`⚠️  LLM indisponível (${err.message}); usando heurística para ${chave}.`);
      s = sugestaoHeuristica({ seletorAtual, xml, platform: f.plataforma, telaEsperada });
    }

    // 4. Validação determinística: a sugestão precisa existir no page source real.
    const validacao = s.seletorSugerido ? validateSelector(s.seletorSugerido, xml, f.plataforma) : null;
    const templateSugerido = s.seletorSugerido && Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(v, `{${k}}`), s.seletorSugerido);
    resultados.push({ ...base, chave, seletorAtual, ...s, templateSugerido, validacao });
  }

  // 5. Relatório + patch
  const aplicaveis = resultados.filter((r) => r.validacao?.valido === true && r.confianca !== 'baixa');
  const patch = Object.fromEntries(aplicaveis.map((r) => [`${r.chave}@${r.plataforma}`, { de: r.seletorAtual, para: r.templateSugerido }]));

  const icone = (r) => (r.validacao?.valido ? '✅' : r.validacao?.valido === null ? '❔' : r.seletorSugerido ? '❌' : '⚠️');
  const md = [
    '## 🩺 Self-healing de seletores (mobile)',
    '',
    `Modo: \`${modo}\` · ${resultados.length} falha(s) analisada(s) · **${aplicaveis.length}** sugestão(ões) validada(s) contra o page source`,
    '',
    '| | Chave | Plataforma | Seletor atual | Sugestão | Diagnóstico | Confiança |',
    '|---|---|---|---|---|---|---|',
    ...resultados.map((r) => `| ${icone(r)} | \`${r.chave ?? '—'}\` | ${r.plataforma} | \`${r.seletorAtual ?? '—'}\` | ${r.seletorSugerido ? `\`${r.seletorSugerido}\`` : '—'} | ${r.diagnostico} | ${r.confianca ?? '—'} |`),
    '',
    '<details><summary>Justificativas</summary>',
    '',
    ...resultados.map((r) => `- **${r.teste}** — ${r.justificativa}${r.validacao ? ` _(validação: ${r.validacao.motivo})_` : ''}`),
    '',
    '</details>',
    '',
    aplicaveis.length
      ? '> Para aplicar as sugestões validadas: `npm run heal -- --apply` (na pasta `ai/`) e revise o diff de `mobile/test/locators.json` antes do commit.'
      : '> Nenhuma sugestão aplicável automaticamente. `tela-errada`/`elemento-ausente` indicam possível **regressão do app** — abrir bug em vez de alterar o teste.',
  ].join('\n');

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'heal-report.md'), `${md}\n`);
  fs.writeFileSync(path.join(OUT, 'heal-report.json'), `${JSON.stringify(resultados, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT, 'locators.patch.json'), `${JSON.stringify(patch, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  console.log(md);

  if (APPLY && aplicaveis.length) {
    for (const r of aplicaveis) {
      const atual = repo[r.chave];
      repo[r.chave] = typeof atual === 'string' ? r.templateSugerido : { ...atual, [r.plataforma]: r.templateSugerido };
    }
    fs.writeFileSync(LOCATORS, `${JSON.stringify(repo, null, 2)}\n`);
    console.log(`\n✍️  ${aplicaveis.length} seletor(es) atualizado(s) em ${path.relative(process.cwd(), LOCATORS)}. Revise com "git diff".`);
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
