import { http } from '../client/http.js';

/** Service Object do recurso /usuarios — um método por operação do CRUD. */
export const UsuariosService = {
  listar: (params) => http.get('/usuarios', { params }),
  criar: (body) => http.post('/usuarios', body),
  buscarPorId: (id) => http.get(`/usuarios/${id}`),
  atualizar: (id, body) => http.put(`/usuarios/${id}`, body),
  excluir: (id) => http.delete(`/usuarios/${id}`),
  /** Envia o corpo cru, sem serializar — usado para testar JSON malformado. */
  criarComCorpoCru: (raw) => http.post('/usuarios', raw, { transformRequest: [(d) => d] }),
};

export const LoginService = {
  autenticar: (email, password) => http.post('/login', { email, password }),
  autenticarComCorpo: (body) => http.post('/login', body),
};

/** Rota protegida usada para provar que o JWT é aceito/rejeitado pela API. */
export const ProdutosService = {
  criar: (body, token) => http.post('/produtos', body, { headers: token ? { authorization: token } : {} }),
  excluir: (id, token) => http.delete(`/produtos/${id}`, { headers: { authorization: token } }),
};

export const CarrinhosService = {
  criar: (body, token) => http.post('/carrinhos', body, { headers: { authorization: token } }),
  cancelar: (token) => http.delete('/carrinhos/cancelar-compra', { headers: { authorization: token } }),
};
