// Lectura de las respuestas de cobro:
//  - PAC: "Archivo Rendición" del Banco de Chile (Excel). Columnas: Identificador de Servicio,
//         Monto de Cargo, Fecha de Cargo, Estado de Cargo... y al final un bloque de totales
//         (Monto Aceptado, Registros Rechazados, Monto Rechazado) que sirve para verificar.
//  - PAT: archivo de Transbank (.004/.csv): "V;monto;NOMBRE;RUT;APROBADA|RECHAZO;DDMMAAAA;motivo"
// Devuelve filas { rut, monto, codigo, motivo, fecha } y el estado lo decide el usuario por código.
import { read, utils } from 'xlsx'
import { normalizeRut } from './rut'

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

function decodificar(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

const monto = (v) => {
  const s = String(v ?? '').replace(/[$\s]/g, '').replace(/[.,]00$/, '').replace(/[.,]/g, '')
  return /^\d+$/.test(s) ? Number(s) : null
}

/** "03012020" o "03/01/2020" -> "2020-01-03" */
const fecha = (v) => {
  const s = String(v ?? '').trim()
  let m = /^(\d{2})\/?(\d{2})\/?(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export async function leerRespuesta(file, medio) {
  const buffer = await file.arrayBuffer()
  return medio === 'PAT' ? leerTransbank(decodificar(buffer)) : leerRendicionBanco(file.name, buffer)
}

function leerTransbank(texto) {
  const filas = []
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.replace(/["\t]/g, '').trim()
    if (!limpia) continue
    const p = limpia.split(';').map((x) => x.trim())
    if (p.length < 5) continue
    filas.push({ rut: p[3], monto: monto(p[1]), codigo: p[4].toUpperCase(), motivo: p[6] || null, fecha: fecha(p[5]) })
  }
  if (!filas.length) throw new Error('No se encontraron líneas con el formato de Transbank (V;monto;nombre;rut;estado;...).')
  return { formato: 'Respuesta Transbank (PAT)', filas, totales: null }
}

function leerRendicionBanco(nombre, buffer) {
  if (/\.txt$/i.test(nombre)) {
    throw new Error('Para PAC carga el “Archivo Rendición” del banco en Excel (.xlsx). El TXT es el formato de envío, no la respuesta.')
  }
  const wb = /\.csv$/i.test(nombre)
    ? read(decodificar(buffer), { type: 'string', raw: true })
    : read(buffer, { cellDates: false })
  const filasHoja = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false })

  const idxEnc = filasHoja.findIndex((f) => f.some((c) => norm(c) === 'identificadordeservicio') && f.some((c) => norm(c) === 'estadodecargo'))
  if (idxEnc < 0) {
    throw new Error('No se encontró la tabla de rendición (columnas “Identificador de Servicio” y “Estado de Cargo”).')
  }
  const col = (nombreCol) => filasHoja[idxEnc].findIndex((c) => norm(c) === nombreCol)
  const c = {
    ident: col('identificadordeservicio'), monto: col('montodecargo'), fecha: col('fechadecargo'),
    estado: col('estadodecargo'), info: col('informacionadicional'),
  }

  const filas = []
  let i = idxEnc + 1
  for (; i < filasHoja.length; i++) {
    const f = filasHoja[i]
    const ident = String(f[c.ident] ?? '').trim()
    if (!ident) break // fin del detalle
    filas.push({
      rut: ident,
      monto: c.monto >= 0 ? monto(f[c.monto]) : null,
      codigo: String(f[c.estado] ?? '').trim() || 'SIN CÓDIGO',
      motivo: c.info >= 0 ? String(f[c.info] ?? '').trim() || null : null,
      fecha: c.fecha >= 0 ? fecha(f[c.fecha]) : null,
    })
  }

  // Bloque de totales del banco (para comparar con lo que el usuario marque como cobrado).
  let totales = null
  const idxTot = filasHoja.findIndex((f, j) => j >= i && f.some((x) => norm(x) === 'montoaceptado'))
  if (idxTot >= 0 && filasHoja[idxTot + 1]) {
    const enc = filasHoja[idxTot].map(norm)
    const val = filasHoja[idxTot + 1]
    const get = (k) => monto(val[enc.indexOf(k)])
    totales = { monto_aceptado: get('montoaceptado'), registros_rechazados: get('registrosrechazados'), monto_rechazado: get('montorechazado') }
  }
  if (!filas.length) throw new Error('La rendición no tiene cargos.')
  return { formato: 'Archivo Rendición Banco de Chile (PAC)', filas, totales }
}

/** Códigos que por defecto se consideran cargo exitoso. El usuario puede cambiarlos en pantalla. */
export const esExitoPorDefecto = (codigo) => ['APROBADA', 'APROBADO', '000', '00', '0', 'OK'].includes(String(codigo).toUpperCase())

/** Agrupa por código para que el usuario confirme qué significa cada uno. */
export function resumirCodigos(filas) {
  const m = new Map()
  for (const f of filas) {
    const r = m.get(f.codigo) ?? { codigo: f.codigo, cantidad: 0, monto: 0, motivo: f.motivo }
    r.cantidad++
    r.monto += f.monto ?? 0
    m.set(f.codigo, r)
  }
  return [...m.values()].sort((a, b) => b.cantidad - a.cantidad)
}

export const rutValido = (r) => normalizeRut(r) !== null
