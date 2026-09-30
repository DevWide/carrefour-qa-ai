import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

// .env na raiz do monorepo (opcional)
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

/**
 * Wrapper único do LLM usado pela camada de IA.
 *
 * Princípios:
 * 1. Degradação graciosa: sem ANTHROPIC_API_KEY os scripts continuam funcionando (modo heurístico).
 * 2. Saída estruturada: toda resposta é forçada a um JSON Schema via tool use — nada de parsear texto livre.
 * 3. Nunca fica no caminho da asserção: a IA gera, sugere e analisa; quem decide pass/fail é o teste determinístico.
 */
export const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';

export function isEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_DISABLED !== 'true';
}

let client;
function getClient() {
  client ??= new Anthropic();
  return client;
}

/**
 * Chama o modelo e devolve um objeto que respeita `schema`.
 * @param {object} opts
 * @param {string} opts.system    instruções de sistema (versionadas em ai/prompts)
 * @param {Array}  opts.content   blocos de conteúdo do usuário (texto e/ou imagem)
 * @param {string} opts.toolName  nome da "ferramenta" de saída
 * @param {object} opts.schema    JSON Schema da saída
 */
export async function structuredCall({ system, content, toolName, schema, maxTokens = 8000 }) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    tools: [{ name: toolName, description: 'Registra a resposta estruturada.', input_schema: schema }],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content }],
  });

  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block) throw new Error(`O modelo não retornou a saída estruturada "${toolName}".`);
  return {
    data: block.input,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens, model: response.model },
  };
}

export const text = (t) => ({ type: 'text', text: t });
export const image = (base64, mediaType = 'image/png') => ({
  type: 'image',
  source: { type: 'base64', media_type: mediaType, data: base64 },
});
