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
  banco: ['banco', 'institucion', 'bancoemisor', 'codigobanco'],
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

/** Informe de socios y cobros: hojas Detalle, Totales y (si hay) Comparativo. */
export function exportarInforme(data, metricas, comparativo) {
  const tasa = (v) => (v == null ? '' : Math.round(v * 1000) / 10)
  const detalle = data.periodos.map((p) => ({
    Periodo: p.etiqueta,
    Desde: p.desde,
    Hasta: p.hasta,
    Altas: p.altas,
    Bajas: p.bajas,
    'Crecimiento neto': p.neto,
    'Socios al cierre': p.activos_cierre,
    'Monto mensual comprometido': p.monto_comprometido,
    'Cobros exitosos': p.socios_cobrados,
    'Socios con respuesta de cobro': p.cargos_intentados,
    'Esperando respuesta': p.cargos_pendientes,
    'Monto cobrado': p.monto_cobrado,
    'Cobrado PAC': p.monto_cobrado_pac,
    'Cobrado PAT': p.monto_cobrado_pat,
    'Cobrado Donar Online': p.monto_cobrado_do,
    'Cobrado Causaxcausa': p.monto_cobrado_cxc,
    'Cobrado transferencias': p.monto_cobrado_trf,
    'Tasa de cobro (%)': tasa(p.tasa_cobro),
  }))
  const totales = metricas.map((m) => ({
    Indicador: m.label.replace(/^· /, ''),
    Valor: m.key === 'tasa_cobro' ? tasa(data.totales[m.key]) : (data.totales[m.key] ?? ''),
  }))
  const wb = utils.book_new()
  const hojaDetalle = utils.json_to_sheet(detalle)
  hojaDetalle['!cols'] = Object.keys(detalle[0] ?? { Periodo: '' }).map((k) => ({ wch: Math.max(12, k.length + 2) }))
  utils.book_append_sheet(wb, hojaDetalle, 'Detalle')
  const hojaTotales = utils.json_to_sheet(totales)
  hojaTotales['!cols'] = [{ wch: 32 }, { wch: 16 }]
  utils.book_append_sheet(wb, hojaTotales, 'Totales')
  if (comparativo?.a && comparativo?.b) {
    const filas = metricas.map((m) => {
      const a = comparativo.a[m.key] ?? null
      const b = comparativo.b[m.key] ?? null
      const esTasa = m.key === 'tasa_cobro'
      return {
        Indicador: m.label.replace(/^· /, ''),
        [comparativo.etiquetaA]: esTasa ? tasa(a) : a,
        [comparativo.etiquetaB]: esTasa ? tasa(b) : b,
        'Diferencia (A - B)': a != null && b != null ? (esTasa ? tasa(a - b) : a - b) : '',
        'Variación (%)': !esTasa && a != null && b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : '',
      }
    })
    const hoja = utils.json_to_sheet(filas)
    hoja['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }]
    utils.book_append_sheet(wb, hoja, 'Comparativo')
  }
  writeFile(wb, `informe_${data.agrupacion}_${data.desde}_a_${data.hasta}.xlsx`)
}

/** Planilla para que la Fundación registre las transferencias directas. */
export function descargarPlantillaTransferencias() {
  const ws = utils.aoa_to_sheet([
    ['Nombre', 'Apellido', 'Monto', 'RUT (opcional)', 'Fecha (opcional)'],
    ['María', 'Pérez Soto', 15000, '12.345.678-5', '05/11/2026'],
    ['Juan', 'González', 5000, '', ''],
  ])
  ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 16 }]
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Transferencias')
  writeFile(wb, 'plantilla_transferencias.xlsx')
}

/** Consolidación del mes: resumen por origen y detalle por donante. */
export function exportarConsolidado(data, origenes, estados) {
  const resumen = data.por_origen.map((o) => ({
    Origen: o.etiqueta,
    Cobrados: o.cobrados,
    'Monto cobrado': o.monto_cobrado,
    Rechazados: o.rechazados,
    'Monto no cobrado': o.monto_no_cobrado,
    'Esperando respuesta': o.pendientes,
    'Socios sin enviar': o.sin_enviar,
    'Tasa de cobro (%)': o.tasa == null ? '' : Math.round(o.tasa * 1000) / 10,
  }))
  const detalle = data.filas.map((f) => ({
    Donante: seguro(f.nombre),
    RUT: f.rut ?? '',
    Origen: origenes[f.origen].label,
    Monto: f.monto,
    Resultado: estados[f.estado].label,
    'Envíos del mes': f.intentos,
    Código: seguro(f.codigo ?? ''),
    Detalle: seguro(f.motivo ?? ''),
    'Fecha de cargo': f.fecha ?? '',
  }))
  const conclusiones = data.conclusiones.map((c) => ({ Conclusión: c.texto }))
  const wb = utils.book_new()
  const h1 = utils.json_to_sheet(resumen)
  h1['!cols'] = Object.keys(resumen[0]).map((k) => ({ wch: Math.max(14, k.length + 2) }))
  utils.book_append_sheet(wb, h1, 'Resumen')
  const h2 = utils.json_to_sheet(detalle.length ? detalle : [{ Donante: '' }])
  h2['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 50 }, { wch: 12 }]
  utils.book_append_sheet(wb, h2, 'Donantes')
  if (conclusiones.length) {
    const h3 = utils.json_to_sheet(conclusiones)
    h3['!cols'] = [{ wch: 110 }]
    utils.book_append_sheet(wb, h3, 'Conclusiones')
  }
  writeFile(wb, `consolidacion_${data.periodo}.xlsx`)
}
