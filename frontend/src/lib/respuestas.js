// Lectura de los archivos de cobro y donaciones. Se reconoce el tipo por su contenido:
//  - Rendición PAC (Excel del Banco de Chile): Identificador de Servicio, Monto de Cargo, Estado de Cargo...
//    Termina con un registro T de totales que sirve para verificar lo interpretado.
//  - Nómina PAC (TXT de 80 bytes): lo que se subió al banco, todavía sin resultado.
//  - Respuesta PAT de Transbank: "monto;NOMBRE;RUT;APROBADA" o "V;monto;NOMBRE;RUT;RECHAZO;DDMMAAAA;motivo".
//  - Nómina PAT: "V;monto;NOMBRE;RUT", sin resultado.
//  - Planillas de plataformas y transferencias: Nombre, Apellido, Monto, Estado, Detalle (pueden no traer RUT).
// Devuelve filas { fila, rut, nombre, monto, codigo, motivo, fecha, banco_codigo }; el estado lo define el
// usuario por código, y el backend vuelve a validar todo.
import { read, utils } from 'xlsx'
import { normalizeRut } from './rut.js'

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

function decodificar(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

const monto = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null
  const s = String(v ?? '').replace(/[$\s]/g, '').replace(/[.,]00?$/, '').replace(/[.,]/g, '')
  return /^\d+$/.test(s) ? Number(s) : null
}

/** "03012020", "03/01/2020" o "2020-01-03" -> "2020-01-03" */
const fecha = (v) => {
  const s = String(v ?? '').trim()
  let m = /^(\d{2})[/-]?(\d{2})[/-]?(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** El mes que más se repite en las fechas del archivo: sugerencia de periodo. */
function periodoDe(filas) {
  const c = {}
  for (const f of filas) if (f.fecha) c[f.fecha.slice(0, 7)] = (c[f.fecha.slice(0, 7)] ?? 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

const esExcel = (buffer) => {
  const b = new Uint8Array(buffer.slice(0, 4))
  return (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf)
}

/** Lee cualquier archivo y reconoce de qué se trata. */
export async function leerArchivo(file) {
  const buffer = await file.arrayBuffer()
  if (esExcel(buffer)) return leerHoja(read(buffer, { cellDates: false }))

  const texto = decodificar(buffer)
  const lineas = texto.split(/\r?\n/).filter((l) => l.replace(/["\t\s]/g, ''))
  if (!lineas.length) throw new Error('El archivo está vacío.')
  if (lineas.every((l) => l.length === 80) && /^[DT]$/.test(lineas[0][9])) return leerNominaPac(lineas)
  const transbank = leerLineasTransbank(lineas)
  if (transbank) return transbank
  return leerHoja(read(texto, { type: 'string', raw: true }))
}

function leerNominaPac(lineas) {
  const filas = lineas.filter((l) => l[9] === 'D').map((l, i) => {
    const y = l.slice(54, 58)
    const m = l.slice(58, 60)
    const d = l.slice(60, 62)
    return {
      fila: i + 1, rut: l.slice(10, 32).trim(), nombre: null, monto: Number(l.slice(43, 54)) / 100,
      banco_codigo: l.slice(0, 3), codigo: null, motivo: null, fecha: `${y}-${m}-${d}`,
    }
  })
  if (!filas.length) throw new Error('La nómina no trae cargos.')
  return {
    tipo: 'nomina_pac', origen: 'PAC', carga: 'subida', etiqueta: 'Nómina PAC enviada al banco',
    filas, totales: null, periodo: periodoDe(filas), sinTotales: !lineas.some((l) => l[9] === 'T'),
  }
}

/** Líneas con RUT separadas por ";". Soporta ambos formatos de Transbank. Null si no lo son. */
function leerLineasTransbank(lineas) {
  const filas = []
  for (const linea of lineas) {
    const p = linea.replace(/["\t]/g, '').trim().split(';').map((x) => x.trim())
    const i = p.findIndex((x) => /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/.test(x))
    if (i < 2) return null
    const resto = p.slice(i + 2).filter(Boolean)
    filas.push({
      fila: filas.length + 1, rut: p[i], nombre: p[i - 1] || null, monto: monto(p[i - 2]), banco_codigo: null,
      codigo: p[i + 1] ? p[i + 1].toUpperCase() : null,
      fecha: fecha(resto.find((x) => /^\d{8}$/.test(x))),
      motivo: resto.find((x) => !/^\d{8}$/.test(x)) ?? null,
    })
  }
  if (!filas.length) return null
  const conEstado = filas.some((f) => f.codigo)
  return {
    tipo: conEstado ? 'respuesta_pat' : 'nomina_pat', origen: 'PAT', carga: conEstado ? 'bajada' : 'subida',
    etiqueta: conEstado ? 'Respuesta de Transbank (PAT)' : 'Nómina PAT enviada a Transbank',
    filas, totales: null, periodo: periodoDe(filas),
  }
}

function leerHoja(wb) {
  const hoja = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false })
  const idxRendicion = hoja.findIndex((f) => f.some((c) => norm(c) === 'identificadordeservicio') && f.some((c) => norm(c) === 'estadodecargo'))
  return idxRendicion >= 0 ? leerRendicion(hoja, idxRendicion) : leerPlanilla(hoja)
}

function leerRendicion(hoja, idxEnc) {
  const col = (n) => hoja[idxEnc].findIndex((c) => norm(c) === n)
  const c = {
    banco: col('codigobanco'), tipo: col('tipoderegistro'), ident: col('identificadordeservicio'), monto: col('montodecargo'),
    fecha: col('fechadecargo'), estado: col('estadodecargo'), info: col('informacionadicional'),
  }
  const filas = []
  let i = idxEnc + 1
  for (; i < hoja.length; i++) {
    const f = hoja[i]
    const ident = String(f[c.ident] ?? '').trim()
    // El detalle termina donde deja de haber registros "D": los totales pueden venir pegados sin fila en blanco.
    if (!ident || (c.tipo >= 0 && String(f[c.tipo]).trim() !== 'D')) break
    filas.push({
      fila: i + 1, rut: ident, nombre: null,
      monto: c.monto >= 0 ? monto(f[c.monto]) : null,
      banco_codigo: c.banco >= 0 ? String(f[c.banco]).trim() : null,
      codigo: String(f[c.estado] ?? '').trim() || 'SIN CÓDIGO',
      motivo: c.info >= 0 ? String(f[c.info] ?? '').trim() || null : null,
      fecha: c.fecha >= 0 ? fecha(f[c.fecha]) : null,
    })
  }
  if (!filas.length) throw new Error('La rendición no tiene cargos.')

  let totales = null
  const idxTot = hoja.findIndex((f, j) => j >= i && f.some((x) => norm(x) === 'montoaceptado'))
  if (idxTot >= 0 && hoja[idxTot + 1]) {
    const enc = hoja[idxTot].map(norm)
    const val = hoja[idxTot + 1]
    const get = (k) => (enc.includes(k) ? monto(val[enc.indexOf(k)]) : null)
    totales = {
      registros_aceptados: get('registrosaceptados'), monto_aceptado: get('montoaceptado'),
      registros_rechazados: get('registrosrechazados'), monto_rechazado: get('montorechazado'),
    }
  }
  return { tipo: 'rendicion_pac', origen: 'PAC', carga: 'bajada', etiqueta: 'Rendición del Banco de Chile (PAC)', filas, totales, periodo: periodoDe(filas) }
}

const ALIAS = {
  nombre: ['nombre', 'nombres', 'nombrecompleto', 'donante', 'nombredonante', 'nombreyapellido'],
  apellido: ['apellido', 'apellidos', 'apellidopaterno'],
  monto: ['monto', 'montodonacion', 'montodonado', 'donacion', 'aporte', 'valor', 'total'],
  estado: ['estado', 'estadodonacion', 'estadopago', 'estadodelpago', 'resultado'],
  motivo: ['detalleestado', 'detalle', 'motivo', 'glosa', 'observacion', 'observaciones'],
  rut: ['rut', 'run', 'documento', 'rutdonante', 'identificacion'],
  fecha: ['fecha', 'fechadonacion', 'fechapago', 'fechacobro', 'fechadetransferencia', 'fechatransferencia'],
}

function leerPlanilla(hoja) {
  const buscar = (f, k) => f.findIndex((c) => ALIAS[k].includes(norm(c)))
  const idxEnc = hoja.findIndex((f) => buscar(f, 'monto') >= 0 && (buscar(f, 'nombre') >= 0 || buscar(f, 'rut') >= 0))
  if (idxEnc < 0) {
    throw new Error('No se reconoce el archivo: faltan columnas de nombre (o RUT) y monto.')
  }
  const enc = hoja[idxEnc]
  const c = Object.fromEntries(Object.keys(ALIAS).map((k) => [k, buscar(enc, k)]))
  const filas = []
  hoja.slice(idxEnc + 1).forEach((f, j) => {
    if (!f.some((x) => String(x).trim())) return
    const nombre = [c.nombre >= 0 ? f[c.nombre] : '', c.apellido >= 0 ? f[c.apellido] : ''].map((x) => String(x).trim()).filter(Boolean).join(' ')
    const motivo = c.motivo >= 0 ? String(f[c.motivo]).trim() : ''
    filas.push({
      fila: idxEnc + j + 2, rut: c.rut >= 0 ? String(f[c.rut]).trim() || null : null, nombre: nombre || null,
      monto: monto(f[c.monto]), banco_codigo: null,
      codigo: c.estado >= 0 ? String(f[c.estado]).trim() || 'SIN ESTADO' : null,
      motivo: motivo || null, fecha: c.fecha >= 0 ? fecha(f[c.fecha]) : null,
    })
  })
  if (!filas.length) throw new Error('La planilla no trae filas de datos.')
  const titulos = enc.map(norm)
  const conEstado = c.estado >= 0
  const esDonarOnline = titulos.includes('montodonacion') && titulos.includes('detalleestado')
  const origen = esDonarOnline ? 'DO' : conEstado ? null : 'TRF'
  return {
    tipo: 'planilla', origen, carga: 'bajada', origenElegible: true,
    etiqueta: esDonarOnline ? 'Planilla de Donar Online' : conEstado ? 'Planilla de donaciones' : 'Planilla de transferencias',
    filas, totales: null, periodo: periodoDe(filas),
  }
}

/** Respuesta de una nómina generada aquí (pantalla Cobros). */
export async function leerRespuesta(file, medio) {
  const l = await leerArchivo(file)
  if (l.origen !== medio || l.carga !== 'bajada') {
    throw new Error(`Este archivo es: ${l.etiqueta}. Para esta nómina se necesita la respuesta ${medio === 'PAC' ? 'del banco' : 'de Transbank'}.`)
  }
  return l
}

// Comprobado con la rendición real: 2 cargos "300" = 2 aceptados por el monto aceptado del banco; "800" = rechazado.
const EXITO = ['300', 'APROBADA', 'APROBADO', 'COBRADA', 'COBRADO', 'PAGADA', 'PAGADO', 'OK']
/** Códigos que por defecto se consideran cargo exitoso. El usuario puede cambiarlos en pantalla. */
export const esExitoPorDefecto = (codigo) => EXITO.includes(String(codigo).toUpperCase())

/** Agrupa por código para que el usuario confirme qué significa cada uno. */
export function resumirCodigos(filas) {
  const m = new Map()
  for (const f of filas) {
    if (f.codigo == null) continue
    const r = m.get(f.codigo) ?? { codigo: f.codigo, cantidad: 0, monto: 0, motivo: f.motivo }
    r.cantidad++
    r.monto += f.monto ?? 0
    r.motivo ??= f.motivo
    m.set(f.codigo, r)
  }
  return [...m.values()].sort((a, b) => b.cantidad - a.cantidad)
}

export const rutValido = (r) => normalizeRut(r) !== null
