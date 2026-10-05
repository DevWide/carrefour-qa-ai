import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Ajv from 'ajv';

// .env na raiz do monorepo (opcional)
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

/**
 * Wrapper único do LLM usado pela camada de IA — independente de fornecedor.
 *
 * Princípios:
 * 1. Degradação graciosa: sem chave de API os scripts continuam funcionando (modo heurístico).
 * 2. Saída estruturada: toda resposta precisa respeitar um JSON Schema, validado com AJV — nada de texto livre.
 * 3. Nunca fica no caminho da asserção: a IA gera, sugere e analisa; quem decide pass/fail é o teste determinístico.
 * 4. Troca de fornecedor sem mexer nos scripts: AI_PROVIDER=openai|gemini|anthropic (ou detecção pela chave presente).
 */
const DEFAULT_MODELS = { openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash', anthropic: 'claude-sonnet-5-5' };
const KEYS = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

export const PROVIDER =
  process.env.AI_PROVIDER || Object.keys(KEYS).find((p) => process.env[KEYS[p]]) || 'none';
export const MODEL = process.env.AI_MODEL || DEFAULT_MODELS[PROVIDER] || 'n/d';

export function isEnabled() {
  if (process.env.AI_DISABLED === 'true') return false;
  return Boolean(KEYS[PROVIDER] && process.env[KEYS[PROVIDER]]);
}

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Chama o modelo e devolve um objeto que respeita `schema`.
 * @param {object} opts
 * @param {string} opts.system    instruções de sistema (versionadas em ai/prompts)
 * @param {Array}  opts.content   blocos de conteúdo do usuário: text(...) e/ou image(...)
 * @param {string} opts.toolName  nome da saída estruturada
 * @param {object} opts.schema    JSON Schema da saída
 */
export async function structuredCall(opts) {
  const call = { openai: callOpenAI, gemini: callGemini, anthropic: callAnthropic }[PROVIDER];
  const validate = ajv.compile(opts.schema);

  // Até 2 tentativas: se a saída não respeitar o schema, o erro de validação volta para o modelo corrigir.
  let feedback = null;
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await call({ ...opts, feedback });
    if (validate(result.data)) return result;
    feedback = ajv.errorsText(validate.errors);
  }
  throw new Error(`A saída do modelo não respeitou o schema "${opts.toolName}": ${feedback}`);
}

// ------------------------------------------------------------------ OpenAI
let openai;
async function callOpenAI({ system, content, toolName, schema, maxTokens = 8000, feedback }) {
  const { default: OpenAI } = await import('openai');
  openai ??= new OpenAI();

  const parts = content.map((b) =>
    b.type === 'image'
      ? { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
      : { type: 'text', text: b.text },
  );
  parts.push({ type: 'text', text: schemaInstruction(toolName, schema, feedback) });

  let response;
  try {
    response = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: parts },
      ],
    });
  } catch (err) {
    throw new Error(modelHint(err));
  }
  const u = response.usage ?? {};
  return { data: parseJson(response.choices[0]?.message?.content), usage: { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0, model: response.model } };
}

function schemaInstruction(toolName, schema, feedback) {
  return (
    `Responda APENAS com um objeto JSON (saída "${toolName}") que respeite exatamente este JSON Schema:\n${JSON.stringify(schema)}` +
    (feedback ? `\n\nSua resposta anterior foi rejeitada pela validação: ${feedback}. Corrija.` : '')
  );
}

function parseJson(raw) {
  try {
    return JSON.parse(String(raw ?? '').replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null; // cai na revalidação e o modelo recebe o feedback
  }
}

function modelHint(err) {
  if (/model.*(not found|does not exist)|404/i.test(err.message)) {
    return `Modelo "${MODEL}" não disponível para esta chave (${PROVIDER}). Defina AI_MODEL no .env com um modelo disponível. Detalhe: ${err.message}`;
  }
  return err.message;
}

// ------------------------------------------------------------------ Gemini (Google)
let gemini;
async function callGemini({ system, content, toolName, schema, maxTokens = 8000, feedback }) {
  const { GoogleGenAI } = await import('@google/genai');
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const parts = content.map((b) =>
    b.type === 'image' ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } } : { text: b.text },
  );
  parts.push({ text: schemaInstruction(toolName, schema, feedback) });

  let response;
  try {
    response = await gemini.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts }],
      config: { systemInstruction: system, responseMimeType: 'application/json', maxOutputTokens: maxTokens, temperature: 0.2 },
    });
  } catch (err) {
    throw new Error(modelHint(err));
  }
  const u = response.usageMetadata ?? {};
  return { data: parseJson(response.text), usage: { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, model: MODEL } };
}

// ------------------------------------------------------------------ Claude (Anthropic)
let anthropic;
async function callAnthropic({ system, content, toolName, schema, maxTokens = 8000, feedback }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  anthropic ??= new Anthropic();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    tools: [{ name: toolName, description: 'Registra a resposta estruturada.', input_schema: schema }],
    tool_choice: { type: 'tool', name: toolName },
    messages: [
      {
        role: 'user',
        content: feedback ? [...content, text(`Sua resposta anterior foi rejeitada pela validação: ${feedback}. Corrija.`)] : content,
      },
    ],
  });

  const block = response.content.find((b) => b.type === 'tool_use');
  return {
    data: block?.input ?? null,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens, model: response.model },
  };
}

export const text = (t) => ({ type: 'text', text: t });
export const image = (base64, mediaType = 'image/png') => ({
  type: 'image',
  source: { type: 'base64', media_type: mediaType, data: base64 },
});
