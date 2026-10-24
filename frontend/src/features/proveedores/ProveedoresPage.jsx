import { useCallback, useEffect, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP } from '../../lib/format'
import { formatRut } from '../../lib/rut'
import { Badge, Button, ConfirmDialog, Field, Icon, Input, Modal, Spinner, Textarea } from '../../components/ui'
import { useToast } from '../../components/Toast'

export default function ProveedoresPage() {
  const toast = useToast()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [borrando, setBorrando] = useState(false)

  const cargar = useCallback(() => {
    api.proveedores.list().then((r) => { setDatos(r.datos); setError('') }, (e) => setError(e.message))
  }, [])
  useEffect(cargar, [cargar])

  const suma = (k) => (datos ?? []).reduce((a, p) => a + p[k], 0)

  const eliminar = async () => {
    setBorrando(true)
    try {
      await api.proveedores.remove(eliminando.id)
      toast(`Proveedor “${eliminando.nombre}” eliminado`)
      setEliminando(null)
      cargar()
    } catch (e) {
      toast(e.message, 'error')
      setEliminando(null)
    } finally {
      setBorrando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Proveedores</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Empresas que captan socios. Por cada socio se les paga un monto mensual durante un número de meses;
            al terminar, el aporte del socio pasa 100% a la Fundación.
          </p>
        </div>
        <Button onClick={() => setEditando('nuevo')}><Icon name="plus" /> Nuevo proveedor</Button>
      </div>

      {datos && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Socios pagando a proveedor" value={suma('pagando').toLocaleString('es-CL')} sub={`${datos.filter((p) => p.activo).length} proveedores activos`} />
          <Stat label="Pago mensual a proveedores" value={formatCLP(suma('monto_mensual'))} sub="Comprometido este mes" />
          <Stat label="Deuda pendiente total" value={formatCLP(suma('deuda_pendiente'))} sub="Cuotas que faltan por pagar" />
          <Stat label="Terminan este mes" value={suma('ultimo_mes').toLocaleString('es-CL')} sub={`${suma('finalizados')} ya son 100% Fundación`} />
        </div>
      )}

      <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {error ? (
          <p className="p-10 text-center text-sm text-red-600">{error}</p>
        ) : !datos ? (
          <div className="grid place-items-center p-16 text-brand-600"><Spinner className="size-7" /></div>
        ) : datos.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon name="building" className="size-6" /></div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">Aún no hay proveedores</h3>
            <p className="mt-1 text-sm text-slate-500">También se crean solos al importar socios con la columna “Proveedor”.</p>
          </div>
        ) : (
          <>
          {/* Móvil: tarjetas */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {datos.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{p.nombre} {!p.activo && <Badge>Inactivo</Badge>}</p>
                    <p className="text-xs text-slate-500">{p.pagando} de {p.socios} socios pagando · deuda {formatCLP(p.deuda_pendiente)}</p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums text-slate-900">{formatCLP(p.monto_mensual)}</span>
                    <span className="text-xs text-slate-500">al mes</span>
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {p.ultimo_mes > 0 && <Badge color="red">{p.ultimo_mes} último mes</Badge>}
                  {p.finalizados > 0 && <Badge color="green">{p.finalizados} 100% Fundación</Badge>}
                  <span className="ml-auto flex gap-1">
                    <a href={`#/socios?proveedor_id=${p.id}`} className="px-2 py-1.5 text-sm font-medium text-brand-700">Socios</a>
                    <button type="button" onClick={() => setEditando(p)} className="rounded-md p-1.5 text-slate-500" aria-label={`Editar ${p.nombre}`}><Icon name="edit" /></button>
                    <button type="button" onClick={() => setEliminando(p)} className="rounded-md p-1.5 text-slate-500" aria-label={`Eliminar ${p.nombre}`}><Icon name="trash" /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {/* Tablet y escritorio: tabla */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3 text-right">Pagando</th>
                  <th className="px-4 py-3 text-right">Pago mensual</th>
                  <th className="px-4 py-3 text-right">Deuda pendiente</th>
                  <th className="px-4 py-3">Alertas</th>
                  <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {datos.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{p.nombre}</span>
                        {!p.activo && <Badge>Inactivo</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {[p.rut && formatRut(p.rut), p.contacto, p.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      <span className="font-medium text-slate-900">{p.pagando}</span>
                      <span className="text-slate-400"> / {p.socios}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-900">{formatCLP(p.monto_mensual)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">{formatCLP(p.deuda_pendiente)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.ultimo_mes > 0 && <Badge color="red">{p.ultimo_mes} último mes</Badge>}
                        {p.finalizados > 0 && <Badge color="green">{p.finalizados} 100% Fundación</Badge>}
                        {!p.ultimo_mes && !p.finalizados && <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <a href={`#/socios?proveedor_id=${p.id}`} className="mr-2 text-sm font-medium text-brand-700 hover:underline">Socios</a>
                      <button type="button" onClick={() => setEditando(p)} className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-brand-700" aria-label={`Editar ${p.nombre}`}><Icon name="edit" /></button>
                      <button type="button" onClick={() => setEliminando(p)} className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-red-600" aria-label={`Eliminar ${p.nombre}`}><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <ProveedorForm
        open={editando !== null}
        proveedor={editando === 'nuevo' ? null : editando}
        onClose={() => setEditando(null)}
        onSaved={(p, nuevo) => {
          toast(nuevo ? `Proveedor “${p.nombre}” creado` : 'Cambios guardados')
          setEditando(null)
          cargar()
        }}
      />
      <ConfirmDialog
        open={!!eliminando}
        title="Eliminar proveedor"
        danger
        loading={borrando}
        confirmLabel="Eliminar"
        onClose={() => setEliminando(null)}
        onConfirm={eliminar}
        message={
          eliminando?.socios > 0
            ? <p>“{eliminando.nombre}” tiene <strong>{eliminando.socios} socio(s)</strong> asociados y no se puede eliminar. Puedes editarlo y marcarlo como inactivo.</p>
            : <p>¿Eliminar a <strong className="text-slate-900">{eliminando?.nombre}</strong>? Esta acción no se puede deshacer.</p>
        }
      />
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>
    </div>
  )
}

const VACIO = { nombre: '', rut: '', contacto: '', email: '', telefono: '', activo: true, observaciones: '' }

/** Formulario de proveedor. También se usa desde el formulario de socio para crear uno rápido. */
export function ProveedorForm({ open, proveedor, onClose, onSaved, nombreInicial = '' }) {
  const [f, setF] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setF(proveedor ? { ...VACIO, ...Object.fromEntries(Object.keys(VACIO).map((k) => [k, proveedor[k] ?? VACIO[k]])), rut: proveedor.rut ? formatRut(proveedor.rut) : '' } : { ...VACIO, nombre: nombreInicial })
    setErrores({})
  }, [open, proveedor, nombreInicial])

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    e.stopPropagation() // puede estar dentro del formulario de socio
    setGuardando(true)
    try {
      const r = proveedor ? await api.proveedores.update(proveedor.id, f) : await api.proveedores.create(f)
      onSaved(r.dato, !proveedor)
    } catch (err) {
      setErrores(Object.keys(err.errores ?? {}).length ? err.errores : { general: err.message })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="prov-form" loading={guardando}>Guardar</Button></>}
    >
      <form id="prov-form" onSubmit={guardar} noValidate className="grid gap-4 sm:grid-cols-2">
        {errores.general && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2" role="alert">{errores.general}</p>}
        <Field label="Nombre" required error={errores.nombre} className="sm:col-span-2">
          {(p) => <Input id={p.id} invalid={p.invalid} value={f.nombre} onChange={set('nombre')} maxLength={120} autoFocus />}
        </Field>
        <Field label="RUT empresa" error={errores.rut}>
          {(p) => <Input id={p.id} invalid={p.invalid} value={f.rut} onChange={set('rut')} placeholder="76.123.456-7" />}
        </Field>
        <Field label="Persona de contacto" error={errores.contacto}>
          {(p) => <Input id={p.id} invalid={p.invalid} value={f.contacto} onChange={set('contacto')} />}
        </Field>
        <Field label="Correo" error={errores.email}>
          {(p) => <Input id={p.id} type="email" invalid={p.invalid} value={f.email} onChange={set('email')} />}
        </Field>
        <Field label="Teléfono" error={errores.telefono}>
          {(p) => <Input id={p.id} type="tel" invalid={p.invalid} value={f.telefono} onChange={set('telefono')} />}
        </Field>
        <Field label="Observaciones" error={errores.observaciones} className="sm:col-span-2">
          {(p) => <Textarea id={p.id} rows={2} maxLength={1000} value={f.observaciones} onChange={set('observaciones')} />}
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={f.activo} onChange={set('activo')} className="size-4 accent-brand-600" />
          Proveedor activo (aparece al asignar socios)
        </label>
      </form>
    </Modal>
  )
}
