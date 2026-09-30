import { identifiers } from './page-source.js';

/** Funções puras do self-healing (sem I/O) — cobertas por testes unitários em ai/test. */

// ------------------------------------------------------------ 1-2. falhas → seletor → chave
const SELECTOR_PATTERNS = [
  /element \("(.+?)"\) still not/,
  /with selector "(.+?)" because element wasn't found/,
  /element \("(.+?)"\) (?:wasn't|was not) found/,
  /\[locator:([\w.]+)\]/, // mensagens customizadas dos Page Objects
];

export function extrairSeletor(erro = '') {
  for (const re of SELECTOR_PATTERNS) {
    const m = erro.match(re);
    if (m) return m[1];
  }
  return null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Descobre a chave do repositório a partir do seletor concreto (considerando templates com {variavel}). */
export function encontrarChave(repo, seletorOuChave, platform) {
  if (repo[seletorOuChave] !== undefined) return { chave: seletorOuChave, vars: {} };
  for (const [chave, valor] of Object.entries(repo)) {
    const template = typeof valor === 'string' ? valor : valor?.[platform];
    if (!template || chave.startsWith('_')) continue;
    const nomes = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const re = new RegExp(`^${escapeRe(template).replace(/\\\{\w+\\\}/g, '(.+?)')}$`);
    const m = seletorOuChave.match(re);
    if (m) return { chave, vars: Object.fromEntries(nomes.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
}

// ------------------------------------------------------------ 3a. heurística offline
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1)
    for (let j = 1; j <= b.length; j += 1)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Similaridade 0..1: distância de edição + bônus quando todos os "pedaços" do id antigo continuam no novo (ex.: input-email → input-login-email). */
export const similaridade = (a, b) => {
  const edit = 1 - levenshtein(norm(a), norm(b)) / Math.max(norm(a).length, norm(b).length, 1);
  const ta = tokens(a);
  const contidos = ta.filter((t) => tokens(b).includes(t)).length / Math.max(ta.length, 1);
  return Math.max(edit, contidos === 1 ? 0.8 + edit * 0.2 : edit);
};

export function sugestaoHeuristica({ seletorAtual, xml, platform }) {
  if (!seletorAtual.startsWith('~')) {
    return { diagnostico: 'nao-suportado', justificativa: 'Heurística offline só trata accessibility id. Configure ANTHROPIC_API_KEY para os demais.' };
  }
  const alvo = seletorAtual.slice(1);
  const attrA11y = platform === 'ios' ? 'name' : 'content-desc';
  const candidatos = identifiers(xml, platform)
    .filter((i) => i.attr === attrA11y)
    .map((i) => ({ ...i, score: similaridade(alvo, i.value) }))
    .sort((a, b) => b.score - a.score);

  const melhor = candidatos[0];
  if (!melhor || melhor.score < 0.6) {
    return {
      diagnostico: 'elemento-ausente',
      justificativa: `Nenhum accessibility id parecido com "${alvo}" na tela (melhor: ${melhor ? `"${melhor.value}" ${(melhor.score * 100).toFixed(0)}%` : 'nenhum'}). Possível regressão ou tela errada.`,
    };
  }
  return {
    diagnostico: 'seletor-alterado',
    seletorSugerido: `~${melhor.value}`,
    confianca: melhor.score > 0.85 ? 'alta' : 'media',
    justificativa: `Similaridade de ${(melhor.score * 100).toFixed(0)}% entre "${alvo}" e "${melhor.value}". Alternativas: ${candidatos.slice(1, 3).map((c) => `"${c.value}" (${(c.score * 100).toFixed(0)}%)`).join(', ') || '—'}.`,
  };
}

