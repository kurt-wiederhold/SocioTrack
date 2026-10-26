import { useEffect, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, formatPeriodo, hoyISO, rangoTexto, sumarDias } from '../../lib/format'
import { Button, Field, Input, Modal, Select, Spinner } from '../../components/ui'
import { MEDIOS_COBRO } from './constants'

export default function GenerarNomina({ periodo, medio, onClose, onCreada }) {
  const [categorias, setCategorias] = useState([])
  const [f, setF] = useState({ categoria_id: '', fecha_facturacion: hoyISO(), fecha_vencimiento: sumarDias(hoyISO(), 14) })
  const [prev, setPrev] = useState(null)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    api.categorias.list().then((r) => setCategorias(r.datos), () => {})
  }, [])

  const body = (simular) => ({
    periodo,
    medio_pago: medio,
    categoria_id: f.categoria_id ? Number(f.categoria_id) : null,
    fecha_facturacion: f.fecha_facturacion,
    fecha_vencimiento: f.fecha_vencimiento,
    simular,
  })

  // Vista previa: cuántos socios entrarían con la configuración actual.
  useEffect(() => {
    let vigente = true
    setPrev(null)
    api.cobros.generar(body(true)).then(
      (r) => { if (vigente) { setPrev(r); setErrores({}) } },
      (e) => { if (vigente) setErrores(Object.keys(e.errores ?? {}).length ? e.errores : { general: e.message }) },
    )
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.categoria_id, f.fecha_facturacion, f.fecha_vencimiento])

  const generar = async () => {
    setGuardando(true)
    try {
      const r = await api.cobros.generar(body(false))
      onCreada(r.nomina)
    } catch (e) {
      setErrores(Object.keys(e.errores ?? {}).length ? e.errores : { general: e.message })
      setGuardando(false)
    }
  }

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  return (
    <Modal
      open
      onClose={onClose}
      title={`Generar nómina ${medio}`}
      description={`${MEDIOS_COBRO[medio].titulo} · ${formatPeriodo(periodo)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={generar} loading={guardando} disabled={!prev || prev.registros === 0}>
            {prev ? `Generar y descargar (${prev.registros})` : 'Generar'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {errores.general && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errores.general}</p>}
        <Field label="Categoría de socios" hint="Para cobrar por grupos (sectorización). Por defecto, todos.">
          {(p) => (
            <Select id={p.id} aria-describedby={p.describedBy} value={f.categoria_id} onChange={set('categoria_id')}>
              <option value="">Todas las categorías</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({rangoTexto(c)})</option>)}
            </Select>
          )}
        </Field>
        {medio === 'PAC' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de facturación" error={errores.fecha_facturacion}>
              {(p) => <Input id={p.id} type="date" invalid={p.invalid} value={f.fecha_facturacion} onChange={set('fecha_facturacion')} />}
            </Field>
            <Field label="Fecha de vencimiento" error={errores.fecha_vencimiento} hint="Día en que el banco hace el cargo.">
              {(p) => <Input id={p.id} type="date" invalid={p.invalid} aria-describedby={p.describedBy} value={f.fecha_vencimiento} onChange={set('fecha_vencimiento')} />}
            </Field>
          </div>
        )}

        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          {!prev ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="size-4" /> Calculando…</div>
          ) : prev.registros === 0 ? (
            <p className="text-sm text-slate-600">No hay socios {medio} pendientes de cobro con esta selección. Puede que ya estén cobrados, esperando respuesta o sin intentos disponibles.</p>
          ) : (
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Cargos</dt><dd className="text-xl font-semibold tabular-nums">{prev.registros}</dd></div>
              <div><dt className="text-xs text-slate-500">Monto total</dt><dd className="text-xl font-semibold tabular-nums">{formatCLP(prev.monto)}</dd></div>
              <div><dt className="text-xs text-slate-500">Reintentos</dt><dd className="text-xl font-semibold tabular-nums">{prev.reintentos}</dd></div>
            </dl>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Se descargará el {MEDIOS_COBRO[medio].envio}. Los socios incluidos quedan “esperando respuesta” y no se vuelven a incluir hasta cargar la respuesta.
        </p>
      </div>
    </Modal>
  )
}
