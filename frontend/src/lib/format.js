const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const mesAnio = new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export const formatCLP = (n) => (n == null || n === '' ? '—' : clp.format(n))

/** Rango de una categoría: "$5.000 – $9.999" o "$20.000 o más". */
export const rangoTexto = (c) =>
  c.monto_max == null ? `${formatCLP(c.monto_min)} o más` : `${formatCLP(c.monto_min)} – ${formatCLP(c.monto_max)}`

/** '2026-01-15' -> '15-01-2026' */
export function formatFecha(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}-${m}-${y}`
}

/** '2026-12-01' -> 'dic 2026' */
export const formatMes = (iso) => (iso ? mesAnio.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '—')

const mesLargo = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** '2026-10' -> 'octubre de 2026' */
export const formatPeriodo = (p) => mesLargo.format(new Date(`${p}-01T00:00:00Z`))

/** '2026-10' + 1 -> '2026-11' */
export function sumarMes(p, n) {
  const [y, m] = p.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

export const periodoActual = () => hoyISO().slice(0, 7)

export const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mismo cálculo que el backend: primer día del último mes de pago al proveedor. */
export function ultimoMesProveedor(inicio, cuotas) {
  const n = parseInt(cuotas, 10)
  if (!inicio || !n || n < 1) return null
  const [y, m] = inicio.split('-').map(Number)
  const total = y * 12 + (m - 1) + (n - 1)
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}
