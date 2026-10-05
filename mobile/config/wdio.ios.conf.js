import path from 'node:path';
import { execSync } from 'node:child_process';
import { config as shared } from './wdio.shared.conf.js';
import { APPS } from '../scripts/download-apps.js';

/**
 * Usa IOS_DEVICE_NAME/IOS_PLATFORM_VERSION se definidos; senão escolhe o iPhone mais recente
 * instalado no Xcode — assim a suíte funciona em qualquer Mac/runner sem editar config.
 */
function pickSimulator() {
  if (process.env.IOS_DEVICE_NAME) {
    return { name: process.env.IOS_DEVICE_NAME, version: process.env.IOS_PLATFORM_VERSION };
  }
  try {
    const { devices } = JSON.parse(execSync('xcrun simctl list devices available -j', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    const candidates = Object.entries(devices)
      .filter(([runtime]) => runtime.includes('iOS'))
      .flatMap(([runtime, list]) => list
        .filter((d) => d.name.startsWith('iPhone'))
        .map((d) => ({ name: d.name, version: runtime.split('iOS-')[1].replaceAll('-', '.') })))
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    if (candidates.length) return candidates[0];
  } catch {
    // fora do macOS (ex.: validação de config no Linux) — cai no padrão abaixo
  }
  return { name: 'iPhone 16', version: undefined };
}

const simulator = pickSimulator();

// Simulador iOS (macOS + Xcode). Lista de simuladores disponíveis: `xcrun simctl list devices available`
export const config = {
  ...shared,
  port: 4723,
  services: [
    [
      'appium',
      {
        args: { relaxedSecurity: true, log: path.resolve(import.meta.dirname, '../logs/appium-ios.log') },
      },
    ],
  ],
  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': simulator.name,
      // No CI o simulador é ligado numa etapa anterior (xcrun simctl bootstatus) e o UDID vem por variável.
      ...(process.env.IOS_UDID && { 'appium:udid': process.env.IOS_UDID }),
      'appium:simulatorStartupTimeout': 300000,
      ...(simulator.version && { 'appium:platformVersion': simulator.version }),
      'appium:app': process.env.IOS_APP_PATH || APPS.ios,
      'appium:newCommandTimeout': 240,
      'appium:wdaLaunchTimeout': 180000,
      'appium:wdaConnectionTimeout': 180000,
      // Primeira execução compila o WebDriverAgent (demora vários minutos); as seguintes reaproveitam.
      'appium:usePrebuiltWDA': process.env.IOS_PREBUILT_WDA === 'true',
      // No CI: WebDriverAgent já compilado (baixado das releases do Appium) → pula a compilação no Xcode.
      ...(process.env.IOS_WDA_PATH && { 'appium:usePreinstalledWDA': true, 'appium:prebuiltWDAPath': process.env.IOS_WDA_PATH }),
      'appium:autoAcceptAlerts': false, // os alertas do app são parte das asserções
    },
  ],
};
