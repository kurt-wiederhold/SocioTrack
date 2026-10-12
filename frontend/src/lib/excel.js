// Lectura y escritura de planillas (xlsx, xls, csv) en el navegador con SheetJS.
// El archivo nunca se sube tal cual: se convierte a filas JSON y el backend las valida.
import { read, utils, writeFile } from 'xlsx'
import { normalizeRut } from './rut'

export const CAMPOS = [
  { key: 'rut', label: 'RUT', requerido: true },
  { key: 'nombre', label: 'Nombre completo', requerido: true },
  { key: 'apellido', label: 'Apellidos (se une al nombre)' },
  { key: 'email', label: 'Correo' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'medio_pago', label: 'Medio de pago (PAC/PAT)', requerido: true },
  { key: 'banco', label: 'Banco' },
  { key: 'monto', label: 'Monto mensual', requerido: true },
  { key: 'estado', label: 'Estado' },
  { key: 'fecha_alta', label: 'Fecha de alta' },
  { key: 'fecha_baja', label: 'Fecha de baja' },
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'proveedor_monto', label: 'Pago mensual al proveedor' },
  { key: 'proveedor_cuotas', label: 'Meses a pagar al proveedor' },
  { key: 'proveedor_inicio', label: 'Inicio pago proveedor' },
  { key: 'observaciones', label: 'Observaciones' },
]

// Encabezados conocidos (normalizados: minúsculas, sin tildes ni símbolos).
const ALIAS = {
  rut: ['rut', 'run', 'rutsocio', 'rutdonante', 'rutcliente', 'identificadordeservicio', 'identservicio', 'documento'],
  nombre: ['nombre', 'nombres', 'nombrecompleto', 'socio', 'nombresocio', 'donante', 'nombredonante', 'cliente'],
  apellido: ['apellido', 'apellidos', 'apellidopaterno'],
  email: ['email', 'correo', 'correoelectronico', 'mail', 'email1'],
  telefono: ['telefono', 'celular', 'fono', 'movil', 'telefonocelular'],
  medio_pago: ['mediodepago', 'mediopago', 'formadepago', 'tipodepago', 'medio', 'pacpat'],
  banco: ['banco', 'institucion', 'bancoemisor'],
  monto: ['monto', 'montomensual', 'aporte', 'aportemensual', 'montodecargo', 'montocargo', 'donacion'],
  estado: ['estado', 'estadosocio'],
  fecha_alta: ['fechaalta', 'fechadealta', 'fechaingreso', 'fechadeingreso', 'fechainscripcion', 'fecha'],
  fecha_baja: ['fechabaja', 'fechadebaja'],
  proveedor: ['proveedor', 'captador', 'empresacaptadora', 'agencia'],
  proveedor_monto: ['montoproveedor', 'pagoproveedor', 'cuotaproveedor'],
  proveedor_cuotas: ['cuotasproveedor', 'mesesproveedor', 'cuotas', 'meses'],
  proveedor_inicio: ['inicioproveedor', 'fechainicioproveedor'],
  observaciones: ['observaciones', 'observacion', 'notas', 'nota', 'comentario', 'comentarios'],
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')

function campoDeEncabezado(h) {
  const n = norm(h)
  if (!n) return ''
  return Object.keys(ALIAS).find((k) => ALIAS[k].includes(n)) ?? ''
}

const letra = (i) => utils.encode_col(i)

/**
 * Lee el primer libro de la planilla y detecta encabezados y columnas.
 * Si no hay fila de encabezados (ej: archivo de Transbank "V;7000;Nombre;RUT"),
 * adivina las columnas por su contenido.
 */
export async function leerPlanilla(file) {
  const buffer = await file.arrayBuffer()
  // CSV/TXT: se lee como texto plano (raw) para que SheetJS no adivine tipos. Si no,
  // "$5.000" se convierte en 5 y "11/10/2026" se lee como fecha de EE.UU. (mes/día).
  // El backend interpreta montos y fechas en formato chileno.
  const wb = /\.(csv|txt)$/i.test(file.name)
    ? read(decodificarTexto(buffer), { type: 'string', raw: true, dense: true })
    : read(buffer, { cellDates: true, dense: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const matriz = utils
    .sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false })
    .map((fila) => fila.map(celda))
    .filter((fila) => fila.some((v) => v !== ''))

  if (!matriz.length) throw new Error('La planilla está vacía.')

  // Busca la fila de encabezados entre las primeras 20 (hay planillas con títulos arriba).
  let filaEncabezado = -1
  for (let i = 0; i < Math.min(20, matriz.length); i++) {
    const reconocidos = matriz[i].filter((h) => campoDeEncabezado(h)).length
    if (reconocidos >= 2) {
      filaEncabezado = i
      break
    }
  }

  const ancho = Math.max(...matriz.map((f) => f.length))
  let columnas
  let datos
  if (filaEncabezado >= 0) {
    const usados = new Set()
    columnas = Array.from({ length: ancho }, (_, i) => {
      const titulo = String(matriz[filaEncabezado][i] ?? '').trim()
      let campo = campoDeEncabezado(titulo)
      if (usados.has(campo)) campo = ''
      if (campo) usados.add(campo)
      return { indice: i, titulo: titulo || `Columna ${letra(i)}`, campo }
    })
    datos = matriz.slice(filaEncabezado + 1).map((valores, j) => ({ fila: filaEncabezado + j + 2, valores }))
  } else {
    datos = matriz.map((valores, j) => ({ fila: j + 1, valores }))
    columnas = adivinarColumnas(datos, ancho)
  }

  return { nombreHoja: wb.SheetNames[0], columnas, datos, conEncabezado: filaEncabezado >= 0 }
}

// CSV de Excel en Chile suele venir en Windows-1252; el de Google Sheets en UTF-8 (a veces sin BOM).
function decodificarTexto(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer) // TextDecoder ya quita el BOM
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function celda(v) {
  if (v instanceof Date) {
    if (isNaN(v)) return ''
    // SheetJS puede correr la fecha unos minutos por la zona horaria (ej. 23:59 del día anterior):
    // se suma 1 hora antes de tomar el día para no perder un día completo.
    const d = new Date(v.getTime() + 3600_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (typeof v === 'string') return v.trim()
  return v
}

function adivinarColumnas(datos, ancho) {
  const muestra = datos.slice(0, 50).map((d) => d.valores)
  const proporcion = (i, test) => muestra.filter((f) => test(f[i])).length / muestra.length
  const usados = new Set()
  const elegir = (campo, test) => {
    let mejor = -1
    let mejorP = 0.6
    for (let i = 0; i < ancho; i++) {
      if ([...usados].some((u) => u.i === i)) continue
      const p = proporcion(i, test)
      if (p > mejorP) [mejor, mejorP] = [i, p]
    }
    if (mejor >= 0) usados.add({ i: mejor, campo })
  }
  elegir('rut', (v) => normalizeRut(v) !== null)
  elegir('email', (v) => /^\S+@\S+\.\S+$/.test(String(v)))
  elegir('monto', (v) => /^\$?\s?\d{1,3}([.,]?\d{3})*$/.test(String(v)) && Number(String(v).replace(/\D/g, '')) >= 100)
  elegir('nombre', (v) => /^[\p{L}'.-]+(\s[\p{L}'.-]+)+$/u.test(String(v)))
  const porIndice = Object.fromEntries([...usados].map((u) => [u.i, u.campo]))
  return Array.from({ length: ancho }, (_, i) => ({ indice: i, titulo: `Columna ${letra(i)}`, campo: porIndice[i] ?? '' }))
}

/** Convierte las filas de la planilla al formato que espera la API. */
export function construirFilas(datos, columnas, { medioPorDefecto }) {
  const mapeadas = columnas.filter((c) => c.campo)
  return datos.map(({ fila, valores }) => {
    const o = { _fila: fila }
    for (const c of mapeadas) {
      const v = valores[c.indice]
      if (v === '' || v == null) continue
      o[c.campo] = v
    }
    if (o.apellido) {
      o.nombre = [o.nombre, o.apellido].filter(Boolean).join(' ')
      delete o.apellido
    }
    if (!o.medio_pago && medioPorDefecto) o.medio_pago = medioPorDefecto
    return o
  })
}

export function descargarPlantilla() {
  const encabezados = [
    'RUT', 'Nombre', 'Correo', 'Teléfono', 'Medio de pago', 'Banco', 'Monto', 'Estado', 'Fecha de alta',
    'Proveedor', 'Monto proveedor', 'Cuotas proveedor', 'Inicio proveedor', 'Observaciones',
  ]
  const ejemplo = [
    ['16.209.682-6', 'Damian Gelerstein', 'damian@correo.cl', '+56912345678', 'PAT', '', 7000, 'activo', '03/01/2020', '', '', '', '', ''],
    ['19.827.237-K', 'María Pérez', '', '', 'PAC', 'Banco de Chile', 5000, 'activo', '15/03/2026', 'Captadora Sur', 2500, 12, '01/04/2026', 'Captada en evento'],
  ]
  const ws = utils.aoa_to_sheet([encabezados, ...ejemplo])
  ws['!cols'] = encabezados.map((h) => ({ wch: Math.max(14, h.length + 2) }))
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Socios')
  writeFile(wb, 'plantilla_socios.xlsx')
}

// Evita "inyección de fórmulas" si el archivo se reabre o se guarda como CSV.
// No toca teléfonos como "+56 9..." (signo seguido de número o espacio).
const seguro = (v) => (typeof v === 'string' && /^([=@\t\r]|[+-](?![\d\s]))/.test(v) ? `'${v}` : v)

export function exportarSocios(socios) {
  const filas = socios.map((s) => ({
    RUT: s.rut,
    Nombre: seguro(s.nombre),
    Correo: seguro(s.email ?? ''),
    Teléfono: seguro(s.telefono ?? ''),
    'Medio de pago': s.medio_pago,
    Banco: seguro(s.banco ?? ''),
    Monto: s.monto,
    Estado: s.estado,
    'Fecha de alta': s.fecha_alta,
    'Fecha de baja': s.fecha_baja ?? '',
    Proveedor: seguro(s.proveedor ?? ''),
    'Monto proveedor': s.proveedor_monto ?? '',
    'Cuotas proveedor': s.proveedor_cuotas ?? '',
    'Inicio proveedor': s.proveedor_inicio ?? '',
    'Último mes proveedor': s.proveedor_fin ?? '',
    Observaciones: seguro(s.observaciones ?? ''),
  }))
  const ws = utils.json_to_sheet(filas)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Socios')
  const d = new Date()
  writeFile(wb, `socios_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`)
}
