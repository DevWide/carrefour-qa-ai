# Matriz de cobertura — API de Usuários (ServeRest)

**Definição de "100% de cobertura" adotada:** todo endpoint do escopo × todo status HTTP que ele pode devolver × validação de contrato (JSON Schema) nas respostas de sucesso, mais as regras de negócio documentadas (unicidade de e-mail, bloqueio de exclusão com carrinho, autenticação JWT).
Cobertura de código não se aplica: é teste caixa-preta de uma API externa.

Legenda: ✅ coberto na suíte principal · 📄 coberto como divergência conhecida (`@known-issue`)

## Endpoints

| Endpoint | Status | Cenário | Arquivo |
|---|---|---|---|
| `GET /usuarios` | 200 | Lista completa + contrato + `quantidade == usuarios.length` | `test/usuarios/listar.spec.js` ✅ |
| | 200 | Filtros por `email`, `_id`, `administrador`, combinação `nome + administrador` | ✅ |
| | 200 | Filtro sem resultado → `{ quantidade: 0, usuarios: [] }` | ✅ |
| | 400 | Parâmetro de consulta não previsto | ✅ |
| | 400 | `administrador` com valor fora do domínio | ✅ |
| `POST /usuarios` | 201 | Cadastro de usuário comum + contrato | `test/usuarios/cadastrar.spec.js` ✅ |
| | 201 | Dados persistidos exatamente como enviados (verificação via GET) | ✅ |
| | 400 | E-mail já cadastrado | ✅ |
| | 400 | JSON malformado | ✅ |
| | 400 | 10 casos de validação data-driven (`data/cadastro-invalido.json`) + casos gerados por IA revisados (`*.ai.json`) | ✅ |
| | 400 | E-mail duplicado com maiúsculas/minúsculas | `test/known-issues` 📄 KI-01 |
| `GET /usuarios/{id}` | 200 | Busca + contrato + igualdade com o cadastrado | `test/usuarios/buscar.spec.js` ✅ |
| | 400 | Id válido inexistente ("Usuário não encontrado") | ✅ |
| | 400 | Id com formato inválido (3 variações) | ✅ |
| | 404 | Recurso inexistente deveria ser 404 | 📄 KI-04 |
| | — | Senha não deveria ser exposta | 📄 KI-02 |
| `PUT /usuarios/{id}` | 200 | Atualização completa persistida | `test/usuarios/atualizar.spec.js` ✅ |
| | 200 | Manter o próprio e-mail | ✅ |
| | 201 | Upsert: id inexistente cria usuário | ✅ |
| | 400 | E-mail de outro usuário (e o registro original não muda) | ✅ |
| | 400 | Campos obrigatórios ausentes | ✅ |
| | 400 | Upsert com e-mail já existente | ✅ |
| `DELETE /usuarios/{id}` | 200 | Exclusão + usuário não é mais encontrado | `test/usuarios/excluir.spec.js` ✅ |
| | 200 | Id inexistente ("Nenhum registro excluído") — idempotência | ✅ |
| | 400 | Usuário com carrinho não pode ser excluído | ✅ |

## Requisitos transversais

| Requisito | Cenário | Arquivo |
|---|---|---|
| Autenticação JWT | Login válido (200 + contrato do Bearer), claims (`email`, `exp > iat`) | `test/auth/login.spec.js` ✅ |
| | Senha errada / e-mail inexistente → 401 com a **mesma** mensagem (não revela se o e-mail existe) | ✅ |
| | Corpo sem credenciais → 400 | ✅ |
| | Token aceito em rota protegida (admin → 201), autorização por perfil (comum → 403) | ✅ |
| | Sem token, token malformado, assinatura adulterada, token de usuário excluído → 401 | ✅ |
| Rate limit 100 req/min | 101ª requisição deveria retornar 429 | 📄 KI-03 (ServeRest não implementa) |
| Tempo de resposta | GET lista, GET por id e PUT dentro do SLA (`API_SLA_MS`, padrão 1000 ms) | `test/nao-funcional/tempo-resposta.spec.js` ✅ |

> Observação sobre o enunciado: o PDF usa `/users` e o campo `administrador` como string. No ServeRest, sugerido pelo próprio desafio, o recurso é `/usuarios` e `administrador` aceita apenas `"true"`/`"false"`. Nos endpoints de usuário, o JWT não é exigido; a autenticação é exercitada na rota protegida `/produtos`.
