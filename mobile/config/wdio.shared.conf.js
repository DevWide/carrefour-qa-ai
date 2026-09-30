import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
dotenv.config({ path: path.join(root, '../.env'), quiet: true }); // .env na raiz do monorepo (opcional)
export const EVIDENCE_DIR = path.join(root, 'evidence');
export const APP_IDS = { android: 'com.wdiodemoapp', ios: 'org.wdiodemoapp' };

const slug = (s) => s.replace(/[^\w-]+/g, '_').slice(0, 90);

/**
 * Configuração comum às três execuções (Android, iOS e BrowserStack).
 * Cada arquivo de plataforma só acrescenta capabilities e services.
 */
export const config = {
  runner: 'local',
  specs: [path.join(root, 'test/specs/**/*.spec.js')],
  maxInstances: 1,
  logLevel: process.env.WDIO_LOG_LEVEL || 'warn',
  outputDir: path.join(root, 'logs'), // logs do WebdriverIO/Appium por worker → artefato do pipeline
  waitforTimeout: 15000,
  connectionRetryTimeout: 180000,
  connectionRetryCount: 2,
  specFileRetries: Number(process.env.SPEC_RETRIES || 0),

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 180000,
    grep: process.env.MOCHA_GREP,
  },

  reporters: [
    'spec',
    [
      'allure',
      {
        outputDir: path.join(root, 'allure-results'),
        disableWebdriverStepsReporting: true, // relatório limpo: só passos de negócio + evidências
        disableWebdriverScreenshotsReporting: false,
        disableMochaHooks: true,
        addConsoleLogs: true,
      },
    ],
  ],

  onPrepare() {
    fs.rmSync(EVIDENCE_DIR, { recursive: true, force: true });
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  },

  /** Grava environment.properties → seção "Environment" do Allure com os dados reais da sessão. */
  async before(capabilities) {
    const session = driver.capabilities;
    const pick = (k) => session[`appium:${k}`] ?? session[k] ?? capabilities[`appium:${k}`];
    const bstack = capabilities['bstack:options'];
    const environment = {
      Plataforma: driver.isIOS ? 'iOS' : 'Android',
      Dispositivo: bstack?.deviceName ?? pick('deviceName'),
      'Versão do SO': bstack?.osVersion ?? pick('platformVersion'),
      'Automation driver': pick('automationName'),
      'App (native-demo-app)': process.env.DEMO_APP_VERSION || 'v2.2.0',
      Execução: bstack ? 'BrowserStack (dispositivo real)' : 'Emulador/Simulador',
      Pipeline: process.env.GITHUB_ACTIONS ? 'GitHub Actions' : process.env.GITLAB_CI ? 'GitLab CI' : 'local',
      Commit: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || 'local',
    };
    const props = Object.entries(environment)
      .map(([k, v]) => `${k.replaceAll(' ', '\\ ')}=${v ?? 'n/d'}`)
      .join('\n');
    fs.mkdirSync(path.join(root, 'allure-results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'allure-results/environment.properties'), `${props}\n`);
  },

  /** Cada teste começa com o app "limpo": fecha e reabre (sem reinstalar, para ser rápido). */
  async beforeTest() {
    const appId = APP_IDS[driver.isIOS ? 'ios' : 'android'];
    await driver.terminateApp(appId);
    await driver.activateApp(appId);
  },

  /**
   * Evidências automáticas:
   * - screenshot ao final de TODO teste (SCREENSHOTS=failures para só nas falhas) → Allure + pasta evidence/
   * - em falha: page source (XML da hierarquia de UI) → Allure + evidence/, insumo do self-healing por IA
   */
  async afterTest(test, _context, { passed, error }) {
    const allure = (await import('@wdio/allure-reporter')).default;
    const name = slug(`${test.parent} - ${test.title}`);
    const status = passed ? 'passou' : 'FALHOU';

    if (!passed || process.env.SCREENSHOTS !== 'failures') {
      const png = await driver.takeScreenshot().catch(() => null);
      if (png) {
        allure.addAttachment(`Screenshot (${status})`, Buffer.from(png, 'base64'), 'image/png');
        fs.writeFileSync(path.join(EVIDENCE_DIR, `${passed ? 'ok' : 'FAIL'}__${name}.png`), png, 'base64');
      }
    }

    if (!passed) {
      const source = await driver.getPageSource().catch(() => null);
      if (source) {
        allure.addAttachment('Page source (hierarquia de UI)', source, 'application/xml');
        fs.writeFileSync(path.join(EVIDENCE_DIR, `FAIL__${name}.xml`), source);
      }
      // Registro estruturado da falha para a camada de IA (ai/self-heal.js)
      const registro = {
        teste: `${test.parent} > ${test.title}`,
        arquivo: path.relative(root, test.file),
        plataforma: driver.isIOS ? 'ios' : 'android',
        erro: error?.message,
        pageSource: source ? `FAIL__${name}.xml` : null,
        screenshot: `FAIL__${name}.png`,
      };
      fs.appendFileSync(path.join(EVIDENCE_DIR, 'failures.jsonl'), `${JSON.stringify(registro)}\n`);
    }
  },
};
