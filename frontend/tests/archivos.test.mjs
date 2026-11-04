// Pruebas del lector de archivos con datos FICTICIOS en el mismo formato de los archivos reales.
// Uso (desde frontend/): node tests/archivos.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { utils, write } from 'xlsx'
import { leerArchivo, leerRespuesta, esExitoPorDefecto, resumirCodigos } from '../src/lib/respuestas.js'

const deTexto = (nombre, t) => {
  const b = new TextEncoder().encode(t)
  return { name: nombre, arrayBuffer: async () => b.buffer }
}
const deHoja = (nombre, aoa) => {
  const b = write({ SheetNames: ['H'], Sheets: { H: utils.aoa_to_sheet(aoa) } }, { type: 'array', bookType: 'xlsx' })
  return { name: nombre, arrayBuffer: async () => b }
}

test('rendición PAC con los totales pegados al detalle', async () => {
  const l = await leerArchivo(deHoja('r.xlsx', [
    ['Razón Social:', 'FUNDACION DE PRUEBA'],
    ['Fecha y Hora :', '02/11/2026 08:37'],
    ['Archivo Rendición'],
    ['Código Banco', 'Código Empresa', 'Código Convenio', 'Tipo de Registro', 'Identificador de Servicio', 'Monto de Cargo', 'Fecha de Vencimiento', 'Fecha de Cargo', 'Estado de Cargo'],
    ['012', '004', '065', 'D', '0123456785             ', 5000, '30/10/2026', '30/10/2026', '300'],
    ['037', '004', '065', 'D', '0099999993             ', 25000, '30/10/2026', '30/10/2026', '800'],
    ['Código Banco', 'Código Empresa', 'Código Convenio', 'Tipo de Registro', 'Fecha Generación', 'Registros Aceptados', 'Monto Aceptado', 'Registros Rechazados', 'Monto Rechazado'],
    ['001', '004', '065', 'T', '30/10/2026', '1', 5000, '1', 25000],
  ]))
  assert.equal(l.tipo, 'rendicion_pac')
  assert.equal(l.filas.length, 2, 'los totales no se leen como un cargo')
  assert.equal(l.filas[1].banco_codigo, '037')
  assert.equal(l.periodo, '2026-10')
  assert.deepEqual(l.totales, { registros_aceptados: 1, monto_aceptado: 5000, registros_rechazados: 1, monto_rechazado: 25000 })
})

test('códigos: 300 es cobrado y 800 no', () => {
  assert.equal(esExitoPorDefecto('300'), true)
  assert.equal(esExitoPorDefecto('800'), false)
  assert.equal(esExitoPorDefecto('Cobrada'), true)
  assert.equal(esExitoPorDefecto('Rechazada'), false)
})

test('respuesta PAT nueva: sin V, sin fecha y sin extensión', async () => {
  const l = await leerArchivo(deTexto('Bajada _PAT', '38000;ANA PRUEBA;12345678-5;APROBADA;;;;;;;;;;;;;;\r\n5000;LUIS PRUEBA;9999999-3;RECHAZO;;;;;;;;;;;;;;\r\n'))
  assert.equal(l.tipo, 'respuesta_pat')
  assert.deepEqual([l.filas[0].monto, l.filas[0].nombre, l.filas[0].rut, l.filas[0].codigo], [38000, 'ANA PRUEBA', '12345678-5', 'APROBADA'])
  assert.equal(l.filas[1].codigo, 'RECHAZO')
})

test('respuesta PAT antigua: con V, comillas, fecha y motivo', async () => {
  const l = await leerRespuesta(deTexto('r.004', '"V;5000;ANA;12345678-5;APROBADA;03012020;;;;"\t\t\t\r\n"V;5000;LUIS;9999999-3;RECHAZO;03012020;TARJETA CON PROBLEMAS, CONTACTE;;;"\t\t\t\r\n\t\t\t\r\n'), 'PAT')
  assert.equal(l.filas.length, 2)
  assert.equal(l.filas[0].fecha, '2020-01-03')
  assert.equal(l.filas[1].motivo, 'TARJETA CON PROBLEMAS, CONTACTE')
  assert.equal(l.periodo, '2020-01')
})

test('nómina PAT sin resultado', async () => {
  const l = await leerArchivo(deTexto('p.csv', 'V;7000;Ana Prueba;12345678-5\r\n'))
  assert.equal(l.tipo, 'nomina_pat')
  assert.equal(l.carga, 'subida')
})

test('nómina PAC: banco por línea y aviso si no trae totales', async () => {
  const lin = (b, id, m) => `${b}004065D${id.padEnd(22)} ${' '.repeat(10)}${String(m * 100).padStart(11, '0')}2026110320261105..........`
  const l = await leerArchivo(deTexto('Subida_PAC.txt', `${lin('012', '0123456785', 1000)}\r\n${lin('037', '0099999993', 2500)}\r\n`))
  assert.equal(l.tipo, 'nomina_pac')
  assert.deepEqual(l.filas.map((f) => [f.banco_codigo, f.monto]), [['012', 1000], ['037', 2500]])
  assert.equal(l.periodo, '2026-11')
  assert.equal(l.sinTotales, true)
})

test('Donar Online: nombre y apellido se unen, sin RUT, filas vacías se ignoran', async () => {
  const l = await leerArchivo(deHoja('do.xlsx', [
    ['Nombre', 'Apellido', 'Monto Donación', 'Estado', 'Detalle Estado'],
    ['Ana', 'Prueba Uno', 500, 'Cobrada', ''],
    ['Luis', 'Prueba', 500, 'Rechazada', 'Tarjeta con restricciones'],
    ['', '', '', '', ''],
  ]))
  assert.equal(l.origen, 'DO')
  assert.equal(l.filas.length, 2)
  assert.equal(l.filas[0].nombre, 'Ana Prueba Uno')
  assert.equal(l.filas[1].motivo, 'Tarjeta con restricciones')
  assert.deepEqual(resumirCodigos(l.filas).map((c) => c.codigo), ['Cobrada', 'Rechazada'])
})

test('transferencias: Nombre, Apellido y Monto, sin estado', async () => {
  const l = await leerArchivo(deHoja('t.xlsx', [['Nombre', 'Apellido', 'Monto'], ['Rosa', 'Prueba', '$15.000']]))
  assert.equal(l.origen, 'TRF')
  assert.equal(l.filas[0].monto, 15000)
  assert.equal(l.filas[0].codigo, null)
})

test('planilla con estado de origen desconocido deja elegir', async () => {
  const l = await leerArchivo(deTexto('c.csv', 'Nombre;Monto;Estado\nAna;1000;Pagada\n'))
  assert.equal(l.origen, null)
  assert.equal(l.origenElegible, true)
  assert.equal(l.filas[0].monto, 1000)
})

test('archivo equivocado para la nómina se rechaza con explicación', async () => {
  await assert.rejects(leerRespuesta(deTexto('p.csv', 'V;7000;Ana;12345678-5\r\n'), 'PAT'), /Este archivo es/)
})

test('archivo que no se reconoce', async () => {
  await assert.rejects(leerArchivo(deTexto('x.csv', 'hola;mundo\n1;2\n')), /No se reconoce/)
})
