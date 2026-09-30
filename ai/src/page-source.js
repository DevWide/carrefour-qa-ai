import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';

/**
 * Utilitários sobre o page source do Appium (XML da hierarquia de UI).
 * Servem para: (1) reduzir o XML antes de mandar ao LLM e (2) VALIDAR um seletor sugerido
 * contra a tela real — a IA sugere, mas só aceitamos o que existe de fato no page source.
 */

const KEEP = {
  android: ['class', 'text', 'content-desc', 'resource-id', 'clickable', 'enabled', 'displayed', 'bounds'],
  ios: ['type', 'name', 'label', 'value', 'enabled', 'visible', 'x', 'y', 'width', 'height'],
};

export function parse(xml) {
  return new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
}

/** Lista "achatada" dos elementos com algum identificador útil — bem menor que o XML bruto. */
export function summarize(xml, platform) {
  const doc = parse(xml);
  const keep = KEEP[platform];
  const out = [];
  const walk = (node, depth) => {
    if (node.nodeType !== 1) return;
    const attrs = Object.fromEntries(keep.map((a) => [a, node.getAttribute(a)]).filter(([, v]) => v !== null && v !== ''));
    const tag = platform === 'ios' ? attrs.type || node.nodeName : attrs.class || node.nodeName;
    const hasId = attrs.text || attrs['content-desc'] || attrs['resource-id'] || attrs.name || attrs.label;
    if (hasId) {
      delete attrs.class;
      delete attrs.type;
      out.push(`${'  '.repeat(Math.min(depth, 12))}<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`);
    }
    for (let i = 0; i < node.childNodes.length; i += 1) walk(node.childNodes[i], depth + 1);
  };
  walk(doc.documentElement, 0);
  return out.join('\n');
}

/** Todos os valores de identificador presentes na tela (para a heurística offline). */
export function identifiers(xml, platform) {
  const doc = parse(xml);
  const attrs = platform === 'ios' ? ['name', 'label'] : ['content-desc', 'text', 'resource-id'];
  const found = new Set();
  const walk = (node) => {
    if (node.nodeType !== 1) return;
    for (const a of attrs) {
      const v = node.getAttribute(a);
      if (v) found.add(`${a}=${v}`);
    }
    for (let i = 0; i < node.childNodes.length; i += 1) walk(node.childNodes[i]);
  };
  walk(doc.documentElement);
  return [...found].map((s) => {
    const i = s.indexOf('=');
    return { attr: s.slice(0, i), value: s.slice(i + 1) };
  });
}

/**
 * Verifica se um seletor WebdriverIO encontra ao menos um elemento no page source.
 * @returns {{ valido: boolean|null, matches?: number, motivo: string }}  null = estratégia não verificável offline
 */
export function validateSelector(selector, xml, platform) {
  const doc = parse(xml);
  const count = (expr) => xpath.select(expr, doc).length;
  const q = (v) => (v.includes('"') ? `'${v}'` : `"${v}"`);

  try {
    if (selector.startsWith('~')) {
      const v = selector.slice(1);
      const n = platform === 'ios' ? count(`//*[@name=${q(v)}]`) : count(`//*[@content-desc=${q(v)}]`);
      return { valido: n > 0, matches: n, motivo: n ? `accessibility id encontrado (${n})` : 'accessibility id não existe na tela' };
    }
    if (selector.startsWith('id=')) {
      const n = count(`//*[@resource-id=${q(selector.slice(3))}]`);
      return { valido: n > 0, matches: n, motivo: n ? `resource-id encontrado (${n})` : 'resource-id não existe na tela' };
    }
    if (selector.startsWith('//') || selector.startsWith('(//')) {
      const n = count(selector);
      return { valido: n > 0, matches: n, motivo: n ? `xpath encontra ${n} elemento(s)` : 'xpath não encontra elementos' };
    }
  } catch (err) {
    return { valido: false, motivo: `seletor inválido: ${err.message}` };
  }
  return { valido: null, motivo: 'estratégia não verificável offline (UiSelector/predicate/class chain) — validar rodando o teste' };
}
