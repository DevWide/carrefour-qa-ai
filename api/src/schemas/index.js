// Contratos (JSON Schema) das respostas da API.
// additionalProperties: false nos objetos de negócio → qualquer campo novo/removido quebra o teste de contrato.

const usuario = {
  type: 'object',
  required: ['nome', 'email', 'password', 'administrador', '_id'],
  additionalProperties: false,
  properties: {
    nome: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 1 },
    administrador: { type: 'string', enum: ['true', 'false'] },
    _id: { type: 'string', pattern: '^[A-Za-z0-9]{16}$' },
  },
};

export const schemas = {
  usuario,

  listaUsuarios: {
    type: 'object',
    required: ['quantidade', 'usuarios'],
    additionalProperties: false,
    properties: {
      quantidade: { type: 'integer', minimum: 0 },
      usuarios: { type: 'array', items: usuario },
    },
  },

  cadastroSucesso: {
    type: 'object',
    required: ['message', '_id'],
    additionalProperties: false,
    properties: {
      message: { const: 'Cadastro realizado com sucesso' },
      _id: { type: 'string', pattern: '^[A-Za-z0-9]{16}$' },
    },
  },

  mensagem: {
    type: 'object',
    required: ['message'],
    properties: { message: { type: 'string', minLength: 1 } },
  },

  loginSucesso: {
    type: 'object',
    required: ['message', 'authorization'],
    additionalProperties: false,
    properties: {
      message: { const: 'Login realizado com sucesso' },
      authorization: { type: 'string', pattern: '^Bearer [\\w-]+\\.[\\w-]+\\.[\\w-]+$' },
    },
  },

  /** Erros de validação: { campo: "mensagem" } */
  errosValidacao: {
    type: 'object',
    minProperties: 1,
    additionalProperties: { type: 'string', minLength: 1 },
  },
};
