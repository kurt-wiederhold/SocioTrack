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
  importar: (filas, { simular, actualizarExistentes }) =>
    request('POST', '/socios/importar', { filas, simular, actualizar_existentes: actualizarExistentes }),
  revisarAlertas: (ids) => request('POST', '/socios/alertas/revisar', ids ? { ids } : { todos: true }),
}

const crud = (ruta) => ({
  list: () => request('GET', ruta),
  create: (data) => request('POST', ruta, data),
  update: (id, data) => request('PUT', `${ruta}/${id}`, data),
  remove: (id) => request('DELETE', `${ruta}/${id}`),
})
export const categorias = crud('/categorias')
export const proveedores = crud('/proveedores')

export const cobros = {
  resumen: (periodo) => request('GET', `/cobros?periodo=${encodeURIComponent(periodo)}`),
  generar: (data) => request('POST', '/cobros/nominas', data),
  nomina: (id) => request('GET', `/cobros/nominas/${id}`),
  respuesta: (id, data) => request('POST', `/cobros/nominas/${id}/respuesta`, data),
  remove: (id) => request('DELETE', `/cobros/nominas/${id}`),
  /** Descarga el archivo de la nómina (TXT para el banco, CSV para Transbank). */
  descargar: async (id) => {
    const res = await fetch(`${BASE}/cobros/nominas/${id}/archivo`, { credentials: 'same-origin' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) onUnauthorized()
      throw new ApiError(res.status, data.error ?? `Error ${res.status}`)
    }
    const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'nomina.txt'
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return nombre
  },
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null))
}
