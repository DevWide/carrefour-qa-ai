# Self-healing na 1ª execução real (Android, Pixel 7 / API 34)

Relatório gerado por `ai/self-heal.js` sobre as evidências reais da primeira execução no emulador, **sem chave de API** (modo heurístico).

**O que aconteceu:** 7 testes falharam com "element wasn't found". Um self-healing ingênuo teria "consertado" os seletores trocando por qualquer coisa parecida na tela. A análise mostrou que o problema **não era o seletor**: no momento da falha o app estava na **Home**, não na tela do teste.

**Causa-raiz:** o reinício do app ficava no hook `beforeTest` do WebdriverIO, que roda *depois* do `beforeEach` do Mocha. O teste navegava para a tela certa e o reinício o levava de volta para a Home. **Correção:** `test/support/app.js` (`restartApp()` chamado no início do `beforeEach`).

As outras duas falhas não eram de seletor e ficaram fora do escopo, corretamente:
- **Swipe:** o gesto era feito a 45% da altura da tela, acima do carrossel. Corrigido para usar a posição real do card.
- **Scroll do Forms:** o WebdriverIO pegava o primeiro ScrollView, que não é rolável. Corrigido informando o container da tela.

## 🩺 Self-healing de seletores (mobile)

Modo: `heurístico (sem ANTHROPIC_API_KEY)` · 6 falha(s) analisada(s) · **0** sugestão(ões) validada(s) contra o page source

| | Chave | Plataforma | Seletor atual | Sugestão | Diagnóstico | Confiança |
|---|---|---|---|---|---|---|
| ⚠️ | `login.tabLogin` | android | `~button-login-container` | — | tela-errada | — |
| ⚠️ | `login.tabSignUp` | android | `~button-sign-up-container` | — | tela-errada | — |
| ⚠️ | `—` | android | `—` | — | nao-e-seletor | — |
| ⚠️ | `forms.input` | android | `~text-input` | — | tela-errada | — |
| ⚠️ | `forms.dropdown` | android | `~Dropdown` | — | tela-errada | — |
| ⚠️ | `—` | android | `—` | — | nao-e-seletor | — |

<details><summary>Justificativas</summary>

- **Login e Cadastro > CT01 @smoke deve realizar login com credenciais válidas** — O teste esperava a tela "Login-screen", mas a tela exibida era: Home-screen. O seletor não é o problema — revisar o fluxo/pré-condição do teste.
- **Login e Cadastro > CT02 @smoke deve realizar cadastro com dados válidos** — O teste esperava a tela "Login-screen", mas a tela exibida era: Home-screen. O seletor não é o problema — revisar o fluxo/pré-condição do teste.
- **Navegação entre telas > CT07 deve percorrer o carrossel com swipe até o último card** — A falha não foi causada por elemento não encontrado (ex.: asserção de valor). Fora do escopo do self-healing.
- **Preenchimento de formulários > CT08 @smoke deve refletir o texto digitado e alternar o switch** — O teste esperava a tela "Forms-screen", mas a tela exibida era: Home-screen. O seletor não é o problema — revisar o fluxo/pré-condição do teste.
- **Preenchimento de formulários > CT09 deve selecionar uma opção no dropdown** — O teste esperava a tela "Forms-screen", mas a tela exibida era: Home-screen. O seletor não é o problema — revisar o fluxo/pré-condição do teste.
- **Preenchimento de formulários > CT10 botão "Active" deve abrir alerta e botão "Inactive" não deve reagir** — A falha não foi causada por elemento não encontrado (ex.: asserção de valor). Fora do escopo do self-healing.

</details>

> Nenhuma sugestão aplicável automaticamente. `tela-errada`/`elemento-ausente` indicam possível **regressão do app** — abrir bug em vez de alterar o teste.
