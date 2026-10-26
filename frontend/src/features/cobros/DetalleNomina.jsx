import { useEffect, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, formatFecha, formatPeriodo } from '../../lib/format'
import { formatRut } from '../../lib/rut'
import { Badge, Button, Icon, Modal, Spinner } from '../../components/ui'

const ESTADOS = {
  pendiente: { label: 'Esperando respuesta', color: 'yellow' },
  cobrado: { label: 'Cobrado', color: 'green' },
  rechazado: { label: 'Rechazado', color: 'red' },
}

export default function DetalleNomina({ nomina, onClose, onDescargar }) {
  const [detalles, setDetalles] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    api.cobros.nomina(nomina.id).then((r) => setDetalles(r.detalles), (e) => setError(e.message))
  }, [nomina.id])

  const visibles = (detalles ?? []).filter((d) => !filtro || d.estado === filtro)
  const cuenta = (e) => (detalles ?? []).filter((d) => d.estado === e).length

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${nomina.medio_pago} · envío ${nomina.numero}`}
      description={`${formatPeriodo(nomina.periodo)} · ${nomina.registros} cargos por ${formatCLP(nomina.monto_total)}${nomina.categoria ? ` · categoría ${nomina.categoria}` : ''}`}
      footer={<><Button variant="secondary" onClick={onDescargar}><Icon name="download" /> Descargar archivo</Button><Button onClick={onClose}>Cerrar</Button></>}
    >
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!detalles && !error ? (
        <div className="grid place-items-center p-10 text-brand-600"><Spinner className="size-7" /></div>
      ) : detalles && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[['', `Todos · ${detalles.length}`], ...Object.entries(ESTADOS).map(([k, v]) => [k, `${v.label} · ${cuenta(k)}`])].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)}
                aria-pressed={filtro === k}
                className={`h-8 rounded-full px-3 text-xs font-medium ring-1 transition focus-visible:outline-2 focus-visible:outline-brand-600 pointer-coarse:h-10 ${filtro === k ? 'bg-slate-800 text-white ring-transparent' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[55vh] overflow-auto rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Socio</th><th className="px-4 py-2 text-right">Monto</th><th className="px-4 py-2">Intento</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2">Detalle</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{d.nombre}</div>
                      <div className="font-mono text-xs text-slate-500">{formatRut(d.rut)}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formatCLP(d.monto)}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{d.intento === 1 ? 'Envío original' : `Reintento ${d.intento - 1}`}</td>
                    <td className="px-4 py-2"><Badge color={ESTADOS[d.estado].color}>{ESTADOS[d.estado].label}</Badge></td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {[d.codigo && `Código ${d.codigo}`, d.motivo, d.fecha_cargo && `cargo ${formatFecha(d.fecha_cargo)}`].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
