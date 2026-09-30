import axios from 'axios';
import * as allure from 'allure-js-commons';

export const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Cliente HTTP único da suíte.
 * - Nunca lança exceção por status HTTP: o teste é quem decide o que é sucesso.
 * - Anexa request e response no Allure (serve como "log de execução" do relatório).
 */
export const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  validateStatus: () => true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  config.metadata = { start: Date.now() };
  return config;
});

http.interceptors.response.use(async (response) => {
  const { config } = response;
  const duration = Date.now() - (config.metadata?.start ?? Date.now());
  response.duration = duration;

  const log = {
    request: {
      method: config.method?.toUpperCase(),
      url: `${config.baseURL ?? ''}${config.url}`,
      params: config.params,
      headers: maskHeaders(config.headers),
      body: safeParse(config.data),
    },
    response: {
      status: response.status,
      durationMs: duration,
      body: response.data,
    },
  };

  try {
    await allure.attachment(
      `${log.request.method} ${config.url} → ${response.status} (${duration} ms)`,
      JSON.stringify(log, null, 2),
      'application/json',
    );
  } catch {
    // fora de um teste (ex.: hooks globais) o Allure não tem contexto; seguimos sem anexar
  }
  return response;
});

function maskHeaders(headers = {}) {
  const plain = typeof headers.toJSON === 'function' ? headers.toJSON() : { ...headers };
  if (plain.authorization) plain.authorization = `${String(plain.authorization).slice(0, 15)}…`;
  return plain;
}

function safeParse(data) {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
