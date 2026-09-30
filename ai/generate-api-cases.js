#!/usr/bin/env node
/**
 * IA na GERAÇÃO de testes (API).
 *
 * Fluxo:
 *  1. Monta o contexto: requisito do desafio + contrato OpenAPI do ServeRest + casos manuais existentes.
 *  2. Pede ao LLM novos casos negativos (saída estruturada).
 *  3. "Oráculo": executa cada caso na API e compara a resposta real com a prevista pela IA.
 *  4. Grava api/data/cadastro-invalido.ai.json com "revisado": false.
 *     → Um humano revisa, ajusta e marca "revisado": true. Só então o caso entra na suíte.
 *
 * Uso: node generate-api-cases.js [--max 10] [--base-url http://localhost:3000]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEnabled, structuredCall, text, MODEL } from './src/llm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, '../api');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const MAX = Number(arg('max', 10));
const BASE_URL = arg('base-url', process.env.API_BASE_URL || 'http://localhost:3000');
const OUT = path.join(apiDir, 'data/cadastro-invalido.ai.json');

const REQUISITO = `Requisitos (documento do desafio Banco Carrefour):
- Para criar um usuário é obrigatório enviar JSON com: nome (string), email (string), password (string), administrador (string).
- Autenticação via JWT. Limite de 100 requisições por minuto.`;

const outputSchema = {
  type: 'object',
  required: ['casos'],
  properties: {
    casos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['descricao', 'tecnica', 'payload', 'errosEsperados', 'confianca', 'racional'],
        properties: {
          descricao: { type: 'string', description: 'Frase curta que completa "deve rejeitar ..."' },
          tecnica: { type: 'string', enum: ['fronteira', 'tipo-invalido', 'formato', 'injecao', 'combinacao', 'outro'] },
          payload: { type: 'object' },
          errosEsperados: { type: 'object', additionalProperties: { type: 'string' } },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          racional: { type: 'string' },
        },
      },
    },
  },
};

function contratoUsuarios() {
  const swagger = JSON.parse(fs.readFileSync(path.join(apiDir, 'node_modules/serverest/docs/swagger.json'), 'utf8'));
  // Resolve $ref de forma simples (o swagger do ServeRest não tem referências circulares).
  const resolve = (node) => {
    if (Array.isArray(node)) return node.map(resolve);
    if (node && typeof node === 'object') {
      if (node.$ref) return resolve(node.$ref.replace('#/', '').split('/').reduce((o, k) => o[k], swagger));
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolve(v)]));
    }
    return node;
  };
  return resolve(swagger.paths['/usuarios'].post);
}

async function executarOraculo(casos) {
  const resultados = [];
  for (const caso of casos) {
    const email = `qa.ai.${Date.now()}${Math.random().toString(36).slice(2, 6)}@teste.com.br`;
    const body = JSON.parse(JSON.stringify(caso.payload).replaceAll('{{email}}', email));
    const res = await fetch(`${BASE_URL}/usuarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 201 && data?._id) await fetch(`${BASE_URL}/usuarios/${data._id}`, { method: 'DELETE' });
    const bate = res.status === 400 && JSON.stringify(data) === JSON.stringify(caso.errosEsperados);
    resultados.push({ ...caso, observado: { status: res.status, body: data }, oraculo: bate ? 'confere' : 'DIVERGE' });
  }
  return resultados;
}

async function main() {
  if (!isEnabled()) {
    console.log('ℹ️  ANTHROPIC_API_KEY não definida: geração por IA ignorada. A suíte segue com os casos manuais.');
    return;
  }

  const existentes = JSON.parse(fs.readFileSync(path.join(apiDir, 'data/cadastro-invalido.json'), 'utf8'));
  const system = fs.readFileSync(path.join(here, 'prompts/generate-api-cases.md'), 'utf8').replace('{{max}}', MAX);

  console.log(`🤖 Gerando até ${MAX} casos com ${MODEL}...`);
  const { data, usage } = await structuredCall({
    system,
    toolName: 'registrar_casos',
    schema: outputSchema,
    content: [
      text(`<requisito>\n${REQUISITO}\n</requisito>`),
      text(`<contrato_openapi>\n${JSON.stringify(contratoUsuarios(), null, 2)}\n</contrato_openapi>`),
      text(`<casos_existentes>\n${JSON.stringify(existentes, null, 2)}\n</casos_existentes>`),
    ],
  });

  console.log(`🔎 Validando ${data.casos.length} casos contra a API real (${BASE_URL})...`);
  const validados = await executarOraculo(data.casos);

  const saida = validados.map((c, i) => ({
    id: `CAD-IA-${String(i + 1).padStart(2, '0')}`,
    revisado: false,
    ...c,
    geradoPor: { modelo: usage.model, em: new Date().toISOString() },
  }));
  fs.writeFileSync(OUT, `${JSON.stringify(saida, null, 2)}\n`);

  const divergentes = saida.filter((c) => c.oraculo === 'DIVERGE');
  console.log(`\n✅ ${saida.length} casos gravados em ${path.relative(process.cwd(), OUT)} (tokens: ${usage.input} in / ${usage.output} out)`);
  console.log(`   ${saida.length - divergentes.length} conferem com a API · ${divergentes.length} divergem`);
  for (const c of divergentes) {
    console.log(`   ⚠️  ${c.id} ${c.descricao}: previsto 400 ${JSON.stringify(c.errosEsperados)} · observado ${c.observado.status} ${JSON.stringify(c.observado.body)}`);
  }
  console.log('\nPróximo passo: revise cada caso. Divergência = ou a IA errou o oráculo, ou encontrou um possível bug.');
  console.log('Marque "revisado": true nos casos aprovados para incluí-los na suíte.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
