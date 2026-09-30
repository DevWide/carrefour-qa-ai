import { faker } from '@faker-js/faker/locale/pt_BR';
import { UsuariosService, LoginService } from '../services/serverest.js';

/** Gera um usuário válido e único (e-mail com timestamp evita colisão entre execuções paralelas). */
export function novoUsuario(overrides = {}) {
  const unique = `${Date.now()}${faker.string.alphanumeric(5)}`.toLowerCase();
  return {
    nome: faker.person.fullName(),
    email: `qa.${unique}@teste.com.br`,
    password: faker.internet.password({ length: 12 }),
    administrador: 'false',
    ...overrides,
  };
}

// Registro de tudo que a suíte criou, para limpar ao final (os testes não deixam lixo no ambiente).
const criados = new Set();

export async function criarUsuario(overrides = {}) {
  const dados = novoUsuario(overrides);
  const res = await UsuariosService.criar(dados);
  if (res.status !== 201) {
    throw new Error(`Pré-condição falhou: não foi possível criar usuário (${res.status} ${JSON.stringify(res.data)})`);
  }
  criados.add(res.data._id);
  return { ...dados, _id: res.data._id };
}

export function registrarParaLimpeza(id) {
  if (id) criados.add(id);
}

export async function criarUsuarioAutenticado(overrides = {}) {
  const usuario = await criarUsuario(overrides);
  const res = await LoginService.autenticar(usuario.email, usuario.password);
  return { ...usuario, token: res.data.authorization };
}

export async function limparUsuariosCriados() {
  await Promise.all([...criados].map((id) => UsuariosService.excluir(id)));
  criados.clear();
}
