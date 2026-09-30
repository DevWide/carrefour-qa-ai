#!/usr/bin/env node
// Baixa os binários do native-demo-app (versão fixada para a suíte ser reproduzível).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const APP_VERSION = process.env.DEMO_APP_VERSION || 'v2.2.0';
const base = `https://github.com/webdriverio/native-demo-app/releases/download/${APP_VERSION}`;
const appsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps');

export const APPS = {
  android: path.join(appsDir, `android.wdio.native.app.${APP_VERSION}.apk`),
  ios: path.join(appsDir, `ios.simulator.wdio.native.app.${APP_VERSION}.zip`),
};

async function download(file) {
  if (fs.existsSync(file)) return console.log(`✔ ${path.basename(file)} já existe`);
  const url = `${base}/${path.basename(file)}`;
  console.log(`↓ ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
  console.log(`✔ ${path.basename(file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const alvo = process.argv[2]; // android | ios | (vazio = ambos)
  fs.mkdirSync(appsDir, { recursive: true });
  const files = alvo ? [APPS[alvo]] : Object.values(APPS);
  for (const f of files) await download(f);
}
