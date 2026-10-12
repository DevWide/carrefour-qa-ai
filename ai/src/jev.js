/**
 * Cliente do Jev (TypeSafe AI) — modelo discriminativo para decisões estruturadas.
 *
 * Diferente dos LLMs, o Jev não gera texto: retorna probabilidades calibradas
 * para perguntas tipadas (choice, score, noul). Ideal para triagem rápida e barata
 * antes de acionar um LLM caro.
 *
 * API: POST https://api.typesafe.ai/v1/systemone
 * Docs: https://jevtypesafeai.com/jev/api
 *
 * Uso:
 *   import { TypeSafeClient } from './jev.js';
 *   const jev = new TypeSafeClient();
 *   const result = await jev.decide({ state, questions });
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// .env na raiz do monorepo (opcional)
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

const DEFAULT_BASE_URL = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_MODEL = process.env.JEV_MODEL || 'jev-latest';

/**
 * Verifica se o Jev está configurado (chave presente e não desabilitado).
 */
export function isJevEnabled() {
  if (process.env.JEV_DISABLED === 'true') return false;
  return Boolean(process.env.JEV_API_KEY);
}

/**
 * Cliente do Jev via HTTP direto (sem dependência externa).
 */
export class TypeSafeClient {
  constructor({ apiKey, baseUrl, model, timeout = 15000 } = {}) {
    this.apiKey = apiKey || process.env.JEV_API_KEY;
    this.baseUrl = baseUrl || process.env.JEV_BASE_URL || DEFAULT_BASE_URL;
    this.model = model || DEFAULT_MODEL;
    this.timeout = timeout;

    if (!this.apiKey) {
      throw new Error('JEV_API_KEY não configurada. Obtenha em https://typesafe.ai (API Keys).');
    }
  }

  /**
   * Faz uma decisão estruturada no Jev.
   *
   * @param {object} opts
   * @param {string|object} opts.state - Contexto/estado para avaliar
   * @param {object} opts.questions - Mapa de perguntas tipadas (choice, score, noul)
   * @returns {Promise<{answers: object, usage: object, model: string}>}
   */
  async decide({ state, questions }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          state,
          questions,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new JevApiError(response.status, errorBody);
      }

      const data = await response.json();
      return {
        answers: data.answers,
        usage: data.usage || { input_tokens: 0, output_tokens: 0 },
        model: data.model || this.model,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout ao chamar Jev (${this.timeout}ms)`);
      }
      throw err;
    }
  }

  /**
   * Cria uma pergunta do tipo "choice" (escolha uma entre várias opções).
   * @param {string} instructions - Instrução para o modelo
   * @param {object} criteria - Mapa { label: descrição }
   */
  static choice(instructions, criteria) {
    return { type: 'choice', instructions, criteria };
  }

  /**
   * Cria uma pergunta do tipo "score" (escala numérica).
   * @param {string} instructions - Instrução para o modelo
   * @param {string[]} criteria - Array de níveis (do menor para o maior)
   */
  static score(instructions, criteria) {
    return { type: 'score', instructions, criteria };
  }

  /**
   * Cria uma pergunta do tipo "noul" (sim/não com probabilidade).
   * @param {string} instructions - Instrução para o modelo
   */
  static noul(instructions) {
    return { type: 'noul', instructions };
  }
}

/**
 * Erro específico da API do Jev.
 */
export class JevApiError extends Error {
  constructor(status, body) {
    super(`Jev API error ${status}: ${body}`);
    this.name = 'JevApiError';
    this.status = status;
    this.body = body;
  }
}

// Helpers de conveniência para criar perguntas
export const choice = TypeSafeClient.choice;
export const score = TypeSafeClient.score;
export const noul = TypeSafeClient.noul;
