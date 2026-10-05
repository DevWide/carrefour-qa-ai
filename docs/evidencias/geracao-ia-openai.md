# Geração de casos com IA: execução real (OpenAI · gpt-4o-mini)

Execução de `ai/generate-api-cases.js` contra o ServeRest local, em 04/10/2026.
**Custo:** 1.903 tokens de entrada + 1.156 de saída, menos de US$ 0,01.

O modelo propôs **9 casos negativos** para `POST /usuarios`. Cada caso foi executado contra a API real (oráculo automático) e depois revisado por mim. O arquivo com todos os casos, o resultado observado e o parecer da revisão está em [`api/data/cadastro-invalido.ai.json`](../../api/data/cadastro-invalido.ai.json).

| Caso | Oráculo | Decisão da revisão |
|---|---|---|
| CAD-IA-03 · senha vazia | confere | ✅ **Aprovado**: isola um campo que o caso manual testava junto com outro |
| CAD-IA-04 · `administrador` como array | confere | ✅ **Aprovado**: tipo não coberto pelos casos manuais |
| CAD-IA-06 · e-mail com `!` no domínio | confere | ✅ **Aprovado**: formato não coberto |
| CAD-IA-05 · nome só com espaços | diverge | 🐞 **Bug provável**: a API aceita. Virou a divergência conhecida **KI-05** |
| CAD-IA-07 · corpo vazio | confere | ❌ Duplica o caso manual CAD-INV-01 |
| CAD-IA-01 / 02 · strings longas | diverge | ❌ O modelo escreveu código (`'a'.repeat(256)`) no JSON e inventou um limite de 255 caracteres que não existe no contrato |
| CAD-IA-08 · e-mail duplicado | diverge | ❌ Erro de desenho: o `{{email}}` gera um e-mail único, então a duplicidade nunca aconteceria |
| CAD-IA-09 · "injeção de SQL" no nome | diverge | ❌ Oráculo inventado: a API é NoSQL e não restringe caracteres no nome |

## O que essa execução mostra

- **A IA amplia a cobertura, mas não decide sozinha.** De 9 casos, 3 entraram na suíte e 1 revelou um provável bug. Os outros 5 foram descartados com justificativa.
- **O oráculo automático é o que torna a revisão rápida.** Cada caso já chega com o resultado real da API. "Diverge" significa que ou a IA errou a expectativa ou encontrou um bug, e só um humano decide qual dos dois.
- **Os erros do modelo viraram melhoria de processo.** Depois desta execução, o prompt (`ai/prompts/generate-api-cases.md`) passou a proibir expressões de código no payload e repetição na descrição.
