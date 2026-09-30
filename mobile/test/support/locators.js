import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../locators.json');
const repo = JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * Resolve um seletor do repositório central (test/locators.json) para a plataforma atual.
 *   loc('login.email')                          → "~input-email"
 *   loc('sideMenu.item', { name: 'forms' })     → "~side-menu-item-forms"
 */
export function loc(key, vars = {}) {
  const entry = repo[key];
  if (entry === undefined) throw new Error(`Seletor "${key}" não existe em test/locators.json`);
  const platform = driver.isIOS ? 'ios' : 'android';
  const raw = typeof entry === 'string' ? entry : entry[platform];
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), raw);
}

/** Atalho: elemento a partir da chave do repositório. */
export const el = (key, vars) => $(loc(key, vars));

/** Mapa reverso seletor → chave (usado pelo self-healing para saber qual entrada corrigir). */
export function keyOf(selector) {
  return Object.entries(repo).find(([, v]) => v === selector || (typeof v === 'object' && Object.values(v).includes(selector)))?.[0];
}
