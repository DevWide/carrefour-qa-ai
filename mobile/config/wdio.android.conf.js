import path from 'node:path';
import { config as shared } from './wdio.shared.conf.js';
import { APPS } from '../scripts/download-apps.js';

// Emulador Android local ou do CI (GitHub Actions sobe o emulador com reactivecircus/android-emulator-runner).
export const config = {
  ...shared,
  port: 4723,
  services: [
    [
      'appium',
      {
        args: { relaxedSecurity: true, log: path.resolve(import.meta.dirname, '../logs/appium-android.log') },
      },
    ],
  ],
  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': process.env.ANDROID_DEVICE_NAME || 'Android Emulator',
      ...(process.env.ANDROID_PLATFORM_VERSION && { 'appium:platformVersion': process.env.ANDROID_PLATFORM_VERSION }),
      'appium:app': process.env.ANDROID_APP_PATH || APPS.android,
      'appium:appWaitActivity': '*',
      'appium:autoGrantPermissions': true,
      'appium:newCommandTimeout': 240,
      'appium:uiautomator2ServerInstallTimeout': 120000,
      'appium:adbExecTimeout': 120000,
    },
  ],
};
