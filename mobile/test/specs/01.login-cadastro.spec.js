import { expect } from 'chai';
import allure from '@wdio/allure-reporter';
import { restartApp } from '../support/app.js';
import LoginScreen from '../pageobjects/LoginScreen.js';
import NativeAlert from '../pageobjects/components/NativeAlert.js';
import usuarios from '../data/usuarios.json' with { type: 'json' };
import loginInvalido from '../data/login-invalido.json' with { type: 'json' };
import { wait } from '../support/wait.js';
import { waitDisplayedDismissingPrompts } from '../support/system-prompts.js';

async function expectValidationMessage(text) {
  const message = LoginScreen.errorMessage(text);
  await waitDisplayedDismissingPrompts(message, { timeout: wait(5000), timeoutMsg: `Mensagem "${text}" não foi exibida` });
  expect(await message.getText()).to.equal(text);
}

describe('Login e Cadastro', () => {
  beforeEach(async () => {
    allure.addFeature('Login / Cadastro');
    await restartApp();
    await LoginScreen.open();
  });

  it('CT01 @smoke deve realizar login com credenciais válidas', async () => {
    await LoginScreen.login(usuarios.loginValido);

    await NativeAlert.waitForDisplayed();
    expect(await NativeAlert.title()).to.equal('Success');
    expect(await NativeAlert.message()).to.equal('You are logged in!');
    await NativeAlert.tap('OK');
  });

  it('CT02 @smoke deve realizar cadastro com dados válidos', async () => {
    await LoginScreen.signUp(usuarios.cadastroValido);

    await NativeAlert.waitForDisplayed();
    expect(await NativeAlert.title()).to.equal('Signed Up!');
    expect(await NativeAlert.message()).to.equal('You successfully signed up!');
    await NativeAlert.tap('OK');
  });

  describe('CT03 deve exibir mensagens de validação no login (data-driven: data/login-invalido.json)', () => {
    for (const caso of loginInvalido) {
      it(`[${caso.id}] ${caso.descricao}`, async () => {
        allure.addArgument('email', caso.email || '(vazio)');
        allure.addArgument('password', caso.password ? '********' : '(vazio)');

        await LoginScreen.login(caso);

        for (const erro of caso.errosEsperados) {
          // eslint-disable-next-line no-await-in-loop
          await expectValidationMessage(erro);
        }
        expect(await NativeAlert.appearsWithin(2500), 'não deveria autenticar com dados inválidos').to.equal(false);
      });
    }
  });

  it('CT04 deve exibir erro no cadastro quando a confirmação de senha é diferente', async () => {
    await LoginScreen.signUp({ ...usuarios.cadastroValido, repeatPassword: 'OutraSenha@99' });

    await expectValidationMessage('Please enter the same password');
    expect(await NativeAlert.appearsWithin(2500), 'não deveria cadastrar com senhas diferentes').to.equal(false);
  });
});
