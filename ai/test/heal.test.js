import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrairSeletor, encontrarChave, sugestaoHeuristica } from '../src/heal.js';
import { validateSelector, summarize } from '../src/page-source.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const xml = fs.readFileSync(path.join(here, 'fixtures/evidence/FAIL__login_email_renomeado.xml'), 'utf8');
const repo = JSON.parse(fs.readFileSync(path.join(here, '../../mobile/test/locators.json'), 'utf8'));

test('extrai o seletor das mensagens de erro do WebdriverIO', () => {
  assert.equal(extrairSeletor('element ("~input-email") still not displayed after 15000ms'), '~input-email');
  assert.equal(extrairSeletor("Can't call click on element with selector \"~button-LOGIN\" because element wasn't found"), '~button-LOGIN');
  assert.equal(extrairSeletor('Tela [locator:forms.screen] não apareceu em 15000 ms'), 'forms.screen');
  assert.equal(extrairSeletor("expected 'a' to equal 'b'"), null);
});

test('mapeia seletor concreto para a chave do repositório, inclusive templates', () => {
  assert.deepEqual(encontrarChave(repo, '~input-email', 'android'), { chave: 'login.email', vars: {} });
  assert.deepEqual(encontrarChave(repo, '~side-menu-item-forms', 'ios'), { chave: 'sideMenu.item', vars: { name: 'forms' } });
  assert.equal(encontrarChave(repo, '~nao-existe', 'android'), null);
});

test('heurística sugere o accessibility id renomeado', () => {
  const s = sugestaoHeuristica({ seletorAtual: '~input-email', xml, platform: 'android' });
  assert.equal(s.diagnostico, 'seletor-alterado');
  assert.equal(s.seletorSugerido, '~input-login-email');
});

test('heurística NÃO inventa seletor quando o elemento sumiu (possível regressão)', () => {
  const s = sugestaoHeuristica({ seletorAtual: '~switch', xml, platform: 'android' });
  assert.equal(s.diagnostico, 'elemento-ausente');
  assert.equal(s.seletorSugerido, undefined);
});

test('valida sugestões contra o page source real', () => {
  assert.equal(validateSelector('~input-login-email', xml, 'android').valido, true);
  assert.equal(validateSelector('~input-email', xml, 'android').valido, false);
  assert.equal(validateSelector('//android.widget.EditText[@password="true"]', xml, 'android').valido, true);
  assert.equal(validateSelector('android=new UiSelector().text("x")', xml, 'android').valido, null);
});

test('resumo do page source mantém identificadores e descarta ruído', () => {
  const resumo = summarize(xml, 'android');
  assert.match(resumo, /content-desc="input-login-email"/);
  assert.doesNotMatch(resumo, /package=/);
  assert.ok(resumo.length < xml.length * 0.8, `resumo ${resumo.length} vs xml ${xml.length}`);
});
