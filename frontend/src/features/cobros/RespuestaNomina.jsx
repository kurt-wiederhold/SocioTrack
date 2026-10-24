import { useEffect, useMemo, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP } from '../../lib/format'
import { formatRut } from '../../lib/rut'
import { esExitoPorDefecto, leerRespuesta, resumirCodigos } from '../../lib/respuestas'
import { Badge, Button, Icon, Modal, Select, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { MEDIOS_COBRO } from './constants'

export default function RespuestaNomina({ nomina, onClose, onAplicada }) {
  const toast = useToast()
  const [archivo, setArchivo] = useState(null)
  const [lectura, setLectura] = useState(null)
  const [mapa, setMapa] = useState({}) // código -> 'cobrado' | 'rechazado'
  const [sinRespuestaRechazo, setSinRespuestaRechazo] = useState(true)
  const [cruce, setCruce] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const elegir = async (file) => {
    if (!file) return
    setError('')
    setCargando(true)
    try {
      const l = await leerRespuesta(file, nomina.medio_pago)
      setArchivo(file)
      setLectura(l)
      setMapa(Object.fromEntries(resumirCodigos(l.filas).map((c) => [c.codigo, esExitoPorDefecto(c.codigo) ? 'cobrado' : 'rechazado'])))
    } catch (e) {
      setError(e.message || 'No se pudo leer el archivo.')
    } finally {
      setCargando(false)
    }
  }

  const filas = useMemo(
    () => (lectura?.filas ?? []).map((f) => ({ rut: f.rut, estado: mapa[f.codigo], codigo: f.codigo, motivo: f.motivo, fecha: f.fecha, monto: f.monto })),
    [lectura, mapa],
  )
  const sinRespuesta = sinRespuestaRechazo ? 'rechazado' : 'pendiente'

  // Simula el cruce cada vez que cambia la interpretación de códigos.
  useEffect(() => {
    if (!lectura) return
    let vigente = true
    setCruce(null)
    api.cobros.respuesta(nomina.id, { filas, simular: true, sin_respuesta: sinRespuesta }).then(
      (r) => vigente && setCruce(r),
      (e) => vigente && setError(e.message),
    )
    return () => { vigente = false }
  }, [lectura, filas, sinRespuesta, nomina.id])

  const aplicar = async () => {
    setAplicando(true)
    try {
      const r = await api.cobros.respuesta(nomina.id, { filas, simular: false, sin_respuesta: sinRespuesta })
      toast(`Respuesta aplicada: ${r.conteo.cobrados} cobrados, ${r.conteo.rechazados + (sinRespuestaRechazo ? r.conteo.sin_respuesta : 0)} rechazados`)
      onAplicada()
    } catch (e) {
      setError(e.message)
      setAplicando(false)
    }
  }

  const codigos = lectura ? resumirCodigos(lectura.filas) : []
  const montoMarcadoCobrado = filas.filter((f) => f.estado === 'cobrado').reduce((a, f) => a + (f.monto ?? 0), 0)
  const totales = lectura?.totales
  const cuadra = !totales || totales.monto_aceptado == null || totales.monto_aceptado === montoMarcadoCobrado
  const observaciones = cruce ? cruce.filas.filter((f) => f.accion !== 'aplicar' || f.mensaje) : []

  return (
    <Modal
      open
      onClose={() => !aplicando && onClose()}
      size="xl"
      title={`Cargar respuesta · ${nomina.medio_pago} envío ${nomina.numero}`}
      description={`Sube el ${MEDIOS_COBRO[nomina.medio_pago].respuesta}. Se cruza por RUT con los ${nomina.registros} cargos de la nómina.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={aplicando}>Cancelar</Button>
          {lectura && (
            <Button onClick={aplicar} loading={aplicando} disabled={!cruce || (cruce.conteo.cobrados + cruce.conteo.rechazados === 0 && !(sinRespuestaRechazo && cruce.conteo.sin_respuesta))}>
              <Icon name="check" /> Aplicar respuesta
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {nomina.estado === 'respondida' && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Esta nómina ya tiene una respuesta cargada. Volver a cargar actualiza el estado de los cargos que vengan en el archivo.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        {!lectura ? (
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files[0]) }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center transition hover:border-brand-400 hover:bg-slate-50"
          >
            {cargando ? <Spinner className="size-8 text-brand-600" /> : <Icon name="upload" className="size-9 text-slate-400" />}
            <span className="mt-3 text-sm font-semibold text-slate-900">Arrastra el archivo de respuesta o haz clic para elegirlo</span>
            <span className="mt-1 text-xs text-slate-500">{nomina.medio_pago === 'PAC' ? 'Excel de rendición (.xlsx, .xls, .csv)' : 'Archivo Transbank (.004, .csv, .txt)'}</span>
            <input type="file" className="sr-only" accept={nomina.medio_pago === 'PAC' ? '.xlsx,.xls,.csv' : '.004,.csv,.txt'} onChange={(e) => { elegir(e.target.files[0]); e.target.value = '' }} />
          </label>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Icon name="file" className="size-5 text-slate-400" />
              <span className="font-medium text-slate-900">{archivo.name}</span>
              <span className="text-slate-500">· {lectura.formato} · {lectura.filas.length} filas</span>
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => { setLectura(null); setCruce(null) }}>Cambiar archivo</button>
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">¿Qué significa cada código de respuesta?</h3>
              <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-2">Código</th><th className="px-4 py-2 text-right">Cargos</th><th className="px-4 py-2 text-right">Monto</th><th className="px-4 py-2">Ejemplo de motivo</th><th className="px-4 py-2">Se registra como</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {codigos.map((c) => (
                      <tr key={c.codigo}>
                        <td className="px-4 py-2 font-mono text-xs">{c.codigo}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{c.cantidad}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCLP(c.monto)}</td>
                        <td className="max-w-64 truncate px-4 py-2 text-xs text-slate-500">{c.motivo ?? '—'}</td>
                        <td className="px-4 py-2">
                          <Select aria-label={`Estado para el código ${c.codigo}`} value={mapa[c.codigo]} onChange={(e) => setMapa((m) => ({ ...m, [c.codigo]: e.target.value }))} className="w-40 py-1">
                            <option value="cobrado">Cobrado</option>
                            <option value="rechazado">Rechazado</option>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totales && (
                <p className={`mt-2 rounded-lg px-3 py-2 text-sm ring-1 ${cuadra ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-amber-50 text-amber-900 ring-amber-200'}`}>
                  Totales del banco: aceptado <strong>{formatCLP(totales.monto_aceptado)}</strong>, {totales.registros_rechazados} rechazados por {formatCLP(totales.monto_rechazado)}.{' '}
                  {cuadra ? 'Coincide con tu selección.' : <>Con tu selección quedarían <strong>{formatCLP(montoMarcadoCobrado)}</strong> cobrados: revisa los códigos.</>}
                </p>
              )}
            </section>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-slate-200">
              <input type="checkbox" checked={sinRespuestaRechazo} onChange={(e) => setSinRespuestaRechazo(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="block text-sm font-medium text-slate-700">Marcar como rechazados los cargos que no vienen en el archivo</span>
                <span className="block text-xs text-slate-500">Así quedan disponibles para el siguiente reintento. Si no lo marcas, siguen esperando respuesta.</span>
              </span>
            </label>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Resultado del cruce <span className="font-normal text-slate-500">(todavía no se guarda)</span></h3>
              {!cruce ? (
                <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="size-4" /> Cruzando con la nómina…</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Dato label="Cobrados" valor={cruce.conteo.cobrados} sub={formatCLP(cruce.conteo.monto_cobrado)} color="text-emerald-700" />
                    <Dato label="Rechazados" valor={cruce.conteo.rechazados} color="text-red-600" />
                    <Dato label="Sin respuesta" valor={cruce.conteo.sin_respuesta} sub={sinRespuestaRechazo ? 'se marcan rechazados' : 'quedan pendientes'} />
                    <Dato label="RUT que no están en la nómina" valor={cruce.conteo.no_encontrados + cruce.conteo.invalidas} color={cruce.conteo.no_encontrados ? 'text-amber-700' : undefined} />
                  </div>
                  {observaciones.length > 0 && (
                    <div className="mt-3 max-h-56 overflow-auto rounded-xl ring-1 ring-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {observaciones.slice(0, 200).map((o) => (
                            <tr key={o.fila}>
                              <td className="px-4 py-2 text-xs text-slate-500">Fila {o.fila}</td>
                              <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{o.rut ? formatRut(o.rut) : '—'}</td>
                              <td className="px-4 py-2">{o.nombre ?? ''}</td>
                              <td className="px-4 py-2"><Badge color={o.accion === 'aplicar' ? 'yellow' : 'red'}>{o.accion === 'aplicar' ? 'Aviso' : o.accion === 'no_encontrado' ? 'No está en la nómina' : 'No se usa'}</Badge></td>
                              <td className="px-4 py-2 text-xs text-slate-600">{o.mensaje}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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

function Dato({ label, valor, sub, color = 'text-slate-900' }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{valor}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
