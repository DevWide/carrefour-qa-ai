// Configuração do Mocha + Allure.
// O reporter "spec" continua no terminal; o Allure grava os resultados em ./allure-results.
const os = require('node:os');

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

module.exports = {
  spec: ['test/**/*.spec.js'],
  require: ['test/hooks.js'],
  timeout: 20000,
  retries: Number(process.env.MOCHA_RETRIES || 0),
  reporter: 'allure-mocha',
  reporterOptions: {
    resultsDir: 'allure-results',
    extraReporters: 'spec',
    environmentInfo: {
      'API Base URL': baseUrl,
      'Node.js': process.version,
      'Sistema operacional': `${os.type()} ${os.release()}`,
      'Pipeline': process.env.GITHUB_ACTIONS ? 'GitHub Actions' : process.env.GITLAB_CI ? 'GitLab CI' : 'local',
      'Commit': process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || 'local',
    },
    categories: [
      { name: 'Falha de contrato (schema)', messageRegex: '.*schema.*' },
      { name: 'Status HTTP inesperado', messageRegex: '.*expected \\d{3} to equal \\d{3}.*' },
      { name: 'Problema de ambiente/conexão', messageRegex: '.*(ECONNREFUSED|ETIMEDOUT|socket hang up).*' },
    ],
  },
};
