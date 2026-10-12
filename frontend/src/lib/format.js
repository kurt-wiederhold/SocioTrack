const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const mesAnio = new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export const formatCLP = (n) => (n == null || n === '' ? '—' : clp.format(n))

/** '2026-01-15' -> '15-01-2026' */
export function formatFecha(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}-${m}-${y}`
}

/** '2026-12-01' -> 'dic 2026' */
export const formatMes = (iso) => (iso ? mesAnio.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '—')

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
