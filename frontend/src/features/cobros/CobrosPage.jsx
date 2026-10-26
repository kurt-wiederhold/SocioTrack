import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, formatFecha, formatPeriodo, periodoActual, sumarMes } from '../../lib/format'
import { Badge, Button, ConfirmDialog, Icon, IconButton, Spinner, textoAccion } from '../../components/ui'
import { useToast } from '../../components/Toast'
import GenerarNomina from './GenerarNomina'
import RespuestaNomina from './RespuestaNomina'
import DetalleNomina from './DetalleNomina'
import { MEDIOS_COBRO } from './constants'

export default function CobrosPage() {
  const toast = useToast()
  const [periodo, setPeriodo] = useState(periodoActual)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [generando, setGenerando] = useState(null) // 'PAC' | 'PAT'
  const [respondiendo, setRespondiendo] = useState(null) // nómina
  const [viendo, setViendo] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [borrando, setBorrando] = useState(false)
  const ultima = useRef(0)

  const cargar = useCallback(async () => {
    const n = ++ultima.current
    try {
      const r = await api.cobros.resumen(periodo)
      if (n === ultima.current) { setData(r); setError('') }
    } catch (e) {
      if (n === ultima.current) setError(e.message)
    }
  }, [periodo])
  useEffect(() => { cargar() }, [cargar])

  const [descargando, setDescargando] = useState(null)
  const descargar = async (n) => {
    if (descargando) return
    setDescargando(n.id)
    try {
      const nombre = await api.cobros.descargar(n.id)
      toast(`Descargado ${nombre}`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setDescargando(null)
    }
  }

  const eliminar = async () => {
    setBorrando(true)
    try {
      await api.cobros.remove(eliminando.id)
      toast('Nómina eliminada; los socios vuelven a quedar por enviar')
      setEliminando(null)
      cargar()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBorrando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Cobros</h1>
          <p className="mt-1 text-sm text-slate-500">Ciclo mensual de cobro a socios por banco (PAC) y Transbank (PAT).</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <IconButton icon="chevronLeft" label="Mes anterior" onClick={() => setPeriodo((p) => sumarMes(p, -1))} />
            <span className="w-40 text-center text-sm font-semibold text-slate-900" aria-live="polite">{mayuscula(formatPeriodo(periodo))}</span>
            <IconButton icon="chevronRight" label="Mes siguiente" onClick={() => setPeriodo((p) => sumarMes(p, 1))} />
          </div>
          {periodo !== periodoActual() && (
            <button type="button" onClick={() => setPeriodo(periodoActual())} className={`${textoAccion} text-xs`}>
              Volver al mes actual
            </button>
          )}
        </div>
      </div>

      <ol className="grid gap-2 text-sm sm:grid-cols-4">
        {[
          ['Generar nómina', 'Con los socios activos aún no cobrados este mes.'],
          ['Enviar archivo', 'Descárgalo y súbelo al banco o a Transbank.'],
          ['Cargar respuesta', 'Se cruza por RUT: cobrado o rechazado.'],
          ['Reintentar', `Los rechazados entran en la siguiente nómina (hasta ${data ? data.max_intentos - 1 : 4} reintentos).`],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
            <span><span className="block font-medium text-slate-900">{t}</span><span className="text-xs text-slate-500">{d}</span></span>
          </li>
        ))}
      </ol>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!data && !error && <div className="grid place-items-center p-16 text-brand-600"><Spinner className="size-7" /></div>}

      {data && (
        <>
          <h2 className="sr-only">Resumen de {formatPeriodo(periodo)}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {Object.entries(MEDIOS_COBRO).map(([medio, m]) => (
              <TarjetaMedio key={medio} info={m} r={data.resumen[medio]} maxIntentos={data.max_intentos} onGenerar={() => setGenerando(medio)} />
            ))}
          </div>

          <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Nóminas de {formatPeriodo(periodo)}</h2>
              <Button variant="ghost" size="sm" onClick={cargar}><Icon name="refresh" /> Actualizar</Button>
            </div>
            {data.nominas.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon name="card" className="size-6" /></div>
                <p className="mt-3 text-sm text-slate-500">Aún no se generan nóminas este mes.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.nominas.map((n) => (
                  <FilaNomina key={n.id} n={n} descargando={descargando === n.id}
                    onDescargar={() => descargar(n)}
                    onResponder={() => setRespondiendo(n)}
                    onVer={() => setViendo(n)}
                    onEliminar={() => setEliminando(n)} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {generando && (
        <GenerarNomina
          periodo={periodo}
          medio={generando}
          onClose={() => setGenerando(null)}
          onCreada={(n) => {
            setGenerando(null)
            cargar()
            toast(`Nómina ${n.medio_pago} envío ${n.numero} generada`)
            descargar(n)
          }}
        />
      )}
      {respondiendo && (
        <RespuestaNomina nomina={respondiendo} onClose={() => setRespondiendo(null)} onAplicada={() => { setRespondiendo(null); cargar() }} />
      )}
      {viendo && <DetalleNomina nomina={viendo} onClose={() => setViendo(null)} onDescargar={() => descargar(viendo)} />}
      <ConfirmDialog
        open={!!eliminando}
        title="Eliminar nómina"
        danger
        loading={borrando}
        confirmLabel="Eliminar"
        onClose={() => setEliminando(null)}
        onConfirm={eliminar}
        message={<p>¿Eliminar la nómina {eliminando?.medio_pago} envío {eliminando?.numero}? Úsalo solo si <strong>no la enviaste</strong> al banco o a Transbank. Sus {eliminando?.registros} socios vuelven a quedar por enviar.</p>}
      />
    </div>
  )
}

const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1)

/** Explica por qué no hay nada que enviar, para que el botón deshabilitado tenga sentido. */
function motivoSinEnvio(r) {
  if (r.socios_activos === 0) return 'No hay socios activos con este medio de pago.'
  if (r.pendientes_respuesta > 0) return 'Hay una nómina esperando respuesta: carga la respuesta para generar los reintentos.'
  if (r.cobrados === r.socios_activos) return 'Todos los socios ya están cobrados este mes.'
  if (r.agotados > 0) return 'Los socios sin cobrar ya usaron todos sus intentos del mes.'
  return 'No hay socios pendientes de envío.'
}

function TarjetaMedio({ info, r, maxIntentos, onGenerar }) {
  const pct = r.socios_activos ? Math.round((100 * r.cobrados) / r.socios_activos) : 0
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{info.titulo}</h2>
          <p className="text-xs text-slate-500">{r.socios_activos} socios activos · {formatCLP(r.monto_esperado)} esperado</p>
        </div>
        <Button size="sm" variant={r.pendientes_respuesta > 0 ? 'secondary' : 'primary'} onClick={onGenerar} disabled={r.por_enviar === 0}>
          <Icon name="plus" /> Generar nómina
        </Button>
      </div>
      {r.por_enviar === 0 && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{motivoSinEnvio(r)}</p>}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatCLP(r.monto_cobrado)}</span>
          <span className="text-sm text-slate-500">{r.cobrados} de {r.socios_activos} cobrados · {pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">Por enviar</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{r.por_enviar}</dd>
          {r.reintentos_disponibles > 0 && <dd className="text-xs text-amber-700">{r.reintentos_disponibles} reintento{r.reintentos_disponibles > 1 ? 's' : ''}</dd>}
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">Esperando respuesta</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{r.pendientes_respuesta}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-3" title={`Rechazados en los ${maxIntentos} intentos del mes`}>
          <dt className="text-xs text-slate-500">Sin cobrar (agotados)</dt>
          <dd className={`font-semibold tabular-nums ${r.agotados ? 'text-red-600' : 'text-slate-900'}`}>{r.agotados}</dd>
        </div>
      </dl>
    </section>
  )
}

function FilaNomina({ n, descargando, onDescargar, onResponder, onVer, onEliminar }) {
  const total = n.registros || 1
  return (
    <li className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={n.medio_pago === 'PAC' ? 'blue' : 'brand'}>{n.medio_pago}</Badge>
          <span className="font-medium text-slate-900">Envío {n.numero}</span>
          {n.categoria && <Badge>{n.categoria}</Badge>}
          {n.estado === 'respondida' ? <Badge color="green">Respondida</Badge> : <Badge color="yellow">Esperando respuesta</Badge>}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Generada {formatFecha(n.creado_en)} · {n.registros} cargos por {formatCLP(n.monto_total)}
          {n.reintentos > 0 && ` · ${n.reintentos} reintento${n.reintentos > 1 ? 's' : ''}`}
          {n.medio_pago === 'PAC' && ` · vence ${formatFecha(n.fecha_vencimiento)}`}
        </p>
      </div>
      <div className="w-full md:w-56">
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className="bg-emerald-500" style={{ width: `${(100 * n.cobrados) / total}%` }} />
          <div className="bg-red-400" style={{ width: `${(100 * n.rechazados) / total}%` }} />
        </div>
        <p className="mt-1 text-xs tabular-nums text-slate-600">
          <span className="text-emerald-700">{n.cobrados} cobrados ({formatCLP(n.monto_cobrado)})</span>
          {' · '}<span className="text-red-600">{n.rechazados} rech.</span>
          {n.pendientes > 0 && <> · {n.pendientes} pend.</>}
        </p>
      </div>
      <div className="flex flex-wrap gap-1 md:justify-end">
        <Button variant="secondary" size="sm" onClick={onDescargar} loading={descargando}>{!descargando && <Icon name="download" />} Archivo</Button>
        <Button variant={n.estado === 'generada' ? 'primary' : 'secondary'} size="sm" onClick={onResponder}>
          <Icon name="upload" /> {n.estado === 'generada' ? 'Cargar respuesta' : 'Volver a cargar'}
        </Button>
        <IconButton icon="eye" label={`Ver detalle del envío ${n.numero}`} onClick={onVer} />
        {n.estado === 'generada' && (
          <IconButton icon="trash" tone="danger" label={`Eliminar envío ${n.numero}`} onClick={onEliminar} />
        )}
      </div>
    </li>
  )
}
