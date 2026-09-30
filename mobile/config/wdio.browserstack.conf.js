import { config as shared } from './wdio.shared.conf.js';
import { APPS } from '../scripts/download-apps.js';

// Dispositivos REAIS no BrowserStack App Automate.
// Credenciais: BROWSERSTACK_USERNAME e BROWSERSTACK_ACCESS_KEY (secrets no CI, .env localmente).
// Observação: o native-demo-app só publica build de iOS para simulador — iOS em dispositivo real não é possível
// com este app (limitação da Apple documentada pelo próprio projeto). Por isso o BrowserStack roda Android real.
const buildName = `native-demo-app ${process.env.GITHUB_RUN_NUMBER || process.env.CI_PIPELINE_IID || 'local'}`;

const devices = (process.env.BS_ANDROID_DEVICES || 'Samsung Galaxy S23:13.0,Google Pixel 8:14.0')
  .split(',')
  .map((d) => d.split(':'));

export const config = {
  ...shared,
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub.browserstack.com',
  maxInstances: devices.length,
  services: [
    [
      'browserstack',
      {
        app: process.env.BROWSERSTACK_APP_ID || APPS.android, // path local → o service faz upload e reaproveita pelo hash
        browserstackLocal: false,
        testObservability: false,
      },
    ],
  ],
  capabilities: devices.map(([deviceName, osVersion]) => ({
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'bstack:options': {
      deviceName,
      osVersion,
      projectName: 'Banco Carrefour — Desafio QA com IA',
      buildName,
      sessionName: 'Suíte mobile',
      debug: true, // screenshots passo a passo no dashboard
      video: true,
      networkLogs: true,
      deviceLogs: true,
    },
  })),
};
