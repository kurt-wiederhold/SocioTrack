// RUT chileno: misma regla que backend/src/Rut.php (el backend vuelve a validar).

export function dv(body) {
  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const r = 11 - (sum % 11)
  return r === 11 ? '0' : r === 10 ? 'K' : String(r)
}

/** Devuelve '12345678-K' o null si es inválido. */
export function normalizeRut(value) {
  const clean = String(value ?? '').toUpperCase().replace(/[^0-9K]/g, '').replace(/^0+/, '')
  if (clean.length < 2 || clean.length > 9) return null
  const body = clean.slice(0, -1)
  if (!/^\d+$/.test(body) || Number(body) < 100000) return null
  return dv(body) === clean.slice(-1) ? `${body}-${clean.slice(-1)}` : null
}

/** '16209682-6' -> '16.209.682-6' */
export function formatRut(rut) {
  if (!rut) return ''
  const [body, d] = rut.split('-')
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${d}`
}
