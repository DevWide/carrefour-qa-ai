import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

function readJson(file) {
  const full = path.join(dataDir, file);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8')) : [];
}

/**
 * Carrega os casos data-driven.
 * - <nome>.json      → casos escritos à mão (baseline)
 * - <nome>.ai.json   → casos gerados pela IA (ai/generate-cases.js).
 *   Só entram na execução os que um humano marcou com "revisado": true.
 */
export function carregarCasos(nome) {
  const manuais = readJson(`${nome}.json`).map((c) => ({ ...c, origem: 'manual' }));
  const ia = readJson(`${nome}.ai.json`)
    .filter((c) => c.revisado === true)
    .map((c) => ({ ...c, origem: 'ia' }));
  return [...manuais, ...ia];
}

/** Substitui {{email}} por um e-mail único, para os casos não falharem por "email já usado". */
export function materializar(payload) {
  const email = `qa.dd.${Date.now()}${Math.random().toString(36).slice(2, 7)}@teste.com.br`;
  return JSON.parse(JSON.stringify(payload).replaceAll('{{email}}', email));
}
