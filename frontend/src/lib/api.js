// Cliente HTTP de la API PHP. Envía la cookie de sesión y el token CSRF.

const BASE = import.meta.env.VITE_API_URL ?? './api'

let csrf = ''
let onUnauthorized = () => {}

export class ApiError extends Error {
  constructor(status, message, errores = {}) {
    super(message)
    this.status = status
    this.errores = errores
  }
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function request(method, path, body, retry = true) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(method !== 'GET' && { 'X-CSRF-Token': csrf }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  }

  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    if (data.csrf) csrf = data.csrf
    return data
  }
  // Token CSRF vencido: se pide uno nuevo y se reintenta una vez.
  if (res.status === 419 && retry) {
    await me()
    return request(method, path, body, false)
  }
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized()
  throw new ApiError(res.status, data.error ?? `Error ${res.status}`, data.errores ?? {})
}

export const me = () => request('GET', '/auth/me')
export const login = (email, password) => request('POST', '/auth/login', { email, password })
export const logout = () => request('POST', '/auth/logout')

export const socios = {
  list: (params) => request('GET', `/socios?${new URLSearchParams(clean(params))}`),
  get: (id) => request('GET', `/socios/${id}`),
  create: (data) => request('POST', '/socios', data),
  update: (id, data) => request('PUT', `/socios/${id}`, data),
  remove: (id) => request('DELETE', `/socios/${id}`),
  proveedores: () => request('GET', '/socios/proveedores'),
  importar: (filas, { simular, actualizarExistentes }) =>
    request('POST', '/socios/importar', { filas, simular, actualizar_existentes: actualizarExistentes }),
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null))
}
