import { useEffect, useMemo, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, formatPeriodo, sumarMes } from '../../lib/format'
import { esExitoPorDefecto, leerArchivo, resumirCodigos } from '../../lib/respuestas'
import { Badge, Button, Field, Icon, IconButton, Modal, Select, Spinner, textoAccion } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { ORIGENES } from './constants'

/** Convierte lo leído al formato de la API según lo que significa cada código. */
const construirFilas = (l, mapa) =>
  l.filas.map((f) => ({
    fila: f.fila, rut: f.rut, nombre: f.nombre, monto: f.monto, banco_codigo: f.banco_codigo,
    codigo: f.codigo, motivo: f.motivo, fecha: f.fecha,
    estado: l.carga === 'subida' ? 'pendiente' : f.codigo == null ? 'cobrado' : mapa[f.codigo],
  }))

export default function CargarArchivo({ periodoInicial, onClose, onCargado }) {
  const toast = useToast()
  const [archivo, setArchivo] = useState(null)
  const [lectura, setLectura] = useState(null)
  const [origen, setOrigen] = useState('')
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [mapa, setMapa] = useState({})
  const [crearSocios, setCrearSocios] = useState(true)
  const [reemplazar, setReemplazar] = useState(false)
  const [simulacion, setSimulacion] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const elegir = async (file) => {
    if (!file) return
    setError('')
    setSimulacion(null)
    setCargando(true)
    try {
      const l = await leerArchivo(file)
      setArchivo(file)
      setLectura(l)
      setOrigen(l.origen ?? '')
      if (l.periodo) setPeriodo(l.periodo)
      setMapa(Object.fromEntries(resumirCodigos(l.filas).map((c) => [c.codigo, esExitoPorDefecto(c.codigo) ? 'cobrado' : 'rechazado'])))
    } catch (e) {
      setLectura(null)
      setError(e.message || 'No se pudo leer el archivo.')
    } finally {
      setCargando(false)
    }
  }

  const filas = useMemo(() => (lectura ? construirFilas(lectura, mapa) : []), [lectura, mapa])
  const cuerpo = useMemo(() => ({
    periodo, origen, tipo: lectura?.carga, archivo: archivo?.name, filas, crear_socios: crearSocios, reemplazar,
  }), [periodo, origen, lectura, archivo, filas, crearSocios, reemplazar])

  // Simula cada vez que cambia algo: nada se guarda hasta confirmar.
  useEffect(() => {
    if (!lectura || !origen) return
    let vigente = true
    setSimulacion(null)
    api.consolidacion.importar({ ...cuerpo, simular: true }).then(
      (r) => { if (vigente) { setSimulacion(r); setError('') } },
      (e) => { if (vigente) setError(e.message) },
    )
    return () => { vigente = false }
  }, [cuerpo, lectura, origen])

  const aplicar = async () => {
    setAplicando(true)
    try {
      await api.consolidacion.importar({ ...cuerpo, simular: false })
      toast(`Se cargó ${archivo.name} en ${formatPeriodo(periodo)}`)
      onCargado(periodo)
    } catch (e) {
      setError(e.message)
      setAplicando(false)
    }
  }

  const codigos = lectura ? resumirCodigos(lectura.filas) : []
  const cobradoElegido = filas.filter((f) => f.estado === 'cobrado').reduce((a, f) => a + (f.monto ?? 0), 0)
  const t = lectura?.totales
  const cuadra = !t || t.monto_aceptado == null || t.monto_aceptado === cobradoElegido
  const c = simulacion?.conteo
  const duplicado = simulacion?.duplicado
  const conRut = origen === 'PAC' || origen === 'PAT'

  return (
    <Modal
      open
      size="xl"
      onClose={() => !aplicando && onClose()}
      title="Cargar archivo"
      description="Reconoce solo si es del banco, Transbank, Donar Online, Causaxcausa o transferencias."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={aplicando}>Cancelar</Button>
          {lectura && (
            <Button onClick={aplicar} loading={aplicando} disabled={!c || c.validas === 0 || !cuadra || (duplicado && !reemplazar)}>
              <Icon name="check" /> Guardar en la consolidación
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        {!lectura ? (
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files[0]) }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center transition hover:border-brand-400 hover:bg-slate-50"
          >
            {cargando ? <Spinner className="size-8 text-brand-600" /> : <Icon name="upload" className="size-9 text-slate-400" />}
            <span className="mt-3 text-sm font-semibold text-slate-900">Arrastra el archivo o haz clic para elegirlo</span>
            <span className="mt-1 text-xs text-slate-500">Excel, CSV, TXT o el archivo de Transbank (puede venir sin extensión)</span>
            <input type="file" className="sr-only" onChange={(e) => { elegir(e.target.files[0]); e.target.value = '' }} />
          </label>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Icon name="file" className="size-5 text-slate-400" />
              <span className="font-medium text-slate-900">{archivo.name}</span>
              <Badge color="blue">{lectura.etiqueta}</Badge>
              <span className="text-slate-500">{lectura.filas.length} filas</span>
              <button type="button" className={textoAccion} onClick={() => { setLectura(null); setSimulacion(null) }}>Cambiar archivo</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="¿De dónde viene?" required hint={lectura.origenElegible ? undefined : 'Reconocido por el contenido del archivo.'}>
                {(p) => (
                  <Select id={p.id} aria-describedby={p.describedBy} value={origen} disabled={!lectura.origenElegible} invalid={!origen} onChange={(e) => setOrigen(e.target.value)}>
                    <option value="">Elige el origen…</option>
                    {Object.entries(ORIGENES)
                      .filter(([k]) => !lectura.origenElegible || !['PAC', 'PAT'].includes(k))
                      .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                )}
              </Field>
              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700">Mes al que corresponde <span className="text-brand-600">*</span></span>
                <div className="flex items-center gap-1">
                  <IconButton variant="secondary" icon="chevronLeft" label="Mes anterior" onClick={() => setPeriodo((m) => sumarMes(m, -1))} />
                  <span className="flex-1 text-center text-sm font-semibold first-letter:uppercase text-slate-900" aria-live="polite">{formatPeriodo(periodo)}</span>
                  <IconButton variant="secondary" icon="chevronRight" label="Mes siguiente" onClick={() => setPeriodo((m) => sumarMes(m, 1))} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{lectura.periodo ? 'Sugerido según las fechas del archivo.' : 'El archivo no trae fechas: revísalo.'}</p>
              </div>
            </div>

            {lectura.sinTotales && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Esta nómina no trae el registro de totales que indica el formato del banco. Se carga igual.</p>
            )}

            {codigos.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">¿Qué significa cada resultado?</h3>
                <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr><th className="px-4 py-2">Resultado</th><th className="px-4 py-2 text-right">Cargos</th><th className="px-4 py-2 text-right">Monto</th><th className="px-4 py-2">Detalle</th><th className="px-4 py-2">Se registra como</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {codigos.map((x) => (
                        <tr key={x.codigo}>
                          <td className="px-4 py-2 font-medium">{x.codigo}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{x.cantidad}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatCLP(x.monto)}</td>
                          <td className="max-w-64 truncate px-4 py-2 text-xs text-slate-500" title={x.motivo ?? undefined}>{x.motivo ?? '—'}</td>
                          <td className="px-4 py-2">
                            <Select aria-label={`Estado para ${x.codigo}`} value={mapa[x.codigo]} onChange={(e) => setMapa((m) => ({ ...m, [x.codigo]: e.target.value }))} className="w-36">
                              <option value="cobrado">Cobrado</option>
                              <option value="rechazado">Rechazado</option>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {t && (
              <p className={`rounded-lg px-3 py-2 text-sm ring-1 ${cuadra ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-900 ring-red-200'}`} role="status">
                {cuadra ? '✓ ' : '⚠ '}Según el banco: aceptados {t.registros_aceptados ?? '—'} por <strong>{formatCLP(t.monto_aceptado)}</strong>; rechazados {t.registros_rechazados ?? '—'} por {formatCLP(t.monto_rechazado)}.{' '}
                {cuadra ? 'Coincide con lo interpretado.' : <>Con tu selección serían <strong>{formatCLP(cobradoElegido)}</strong> cobrados: corrige los resultados para poder guardar.</>}
              </p>
            )}

            {conRut && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-slate-200">
                <input type="checkbox" checked={crearSocios} onChange={(e) => setCrearSocios(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
                <span>
                  <span className="block text-sm font-medium text-slate-700">Registrar como socios los RUT que aún no existen</span>
                  <span className="block text-xs text-slate-500">Así pueden entrar a la siguiente nómina. El banco no entrega nombres: quedan “Sin nombre” hasta completarlos.</span>
                </span>
              </label>
            )}

            {duplicado && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
                <span>
                  <span className="block text-sm font-medium text-amber-900">Este archivo ya se cargó para este mes ({duplicado.archivo})</span>
                  <span className="block text-xs text-amber-800">Para no contarlo dos veces no se guardará, salvo que marques esta opción y reemplace la carga anterior.</span>
                </span>
              </label>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Resultado <span className="font-normal text-slate-500">(todavía no se guarda)</span></h3>
              {!origen ? (
                <p className="text-sm text-slate-500">Elige el origen para ver el resultado.</p>
              ) : !c ? (
                <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="size-4" /> Revisando…</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Dato label="Cobrados" valor={c.cobrados} sub={formatCLP(c.monto_cobrado)} />
                    <Dato label="Rechazados" valor={c.rechazados} sub={formatCLP(c.monto_rechazado)} />
                    {lectura.carga === 'subida' && <Dato label="Enviados, sin respuesta" valor={c.pendientes} />}
                    {conRut
                      ? <Dato label="Socios nuevos" valor={c.socios_nuevos} sub={crearSocios ? 'se registran' : 'no se registran'} />
                      : <Dato label="Calzan con un socio" valor={c.vinculados} sub={`${c.sin_vincular} solo por nombre`} />}
                    <Dato label="Filas con problemas" valor={c.invalidas} sub={c.invalidas ? 'no se cargan' : 'ninguna'} />
                  </div>
                  {c.responde_nomina > 0 && (
                    <p className="mt-2 text-sm text-slate-600">{c.responde_nomina} cargos responden una nómina que estaba esperando respuesta.</p>
                  )}
                  {simulacion.observaciones.length > 0 && (
                    <ul className="mt-3 max-h-40 divide-y divide-slate-100 overflow-auto rounded-xl text-sm ring-1 ring-slate-200">
                      {simulacion.observaciones.map((o, i) => (
                        <li key={i} className="px-3 py-2 text-xs text-slate-600">
                          <span className="font-medium text-slate-900">Fila {o.fila}{o.nombre ? ` · ${o.nombre}` : ''}:</span> {o.mensaje}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}

function Dato({ label, valor, sub }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-slate-900">{valor}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
