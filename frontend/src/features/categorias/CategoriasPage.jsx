import { useCallback, useEffect, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, rangoTexto } from '../../lib/format'
import { Badge, Button, ConfirmDialog, Field, Icon, Input, Modal, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'

const COLORES = { gray: 'Gris', brand: 'Morado', blue: 'Azul', green: 'Verde', yellow: 'Amarillo', red: 'Rojo' }
const BARRA = { gray: 'bg-slate-400', brand: 'bg-brand-500', blue: 'bg-sky-500', green: 'bg-emerald-500', yellow: 'bg-amber-400', red: 'bg-red-500' }

export default function CategoriasPage() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null) // null | 'nueva' | categoría
  const [eliminando, setEliminando] = useState(null)
  const [borrando, setBorrando] = useState(false)

  const cargar = useCallback(() => {
    api.categorias.list().then((r) => { setData(r); setError('') }, (e) => setError(e.message))
  }, [])
  useEffect(cargar, [cargar])

  const totalSocios = data ? data.datos.reduce((a, c) => a + c.socios_activos, 0) + data.socios_sin_categoria : 0

  const eliminar = async () => {
    setBorrando(true)
    try {
      await api.categorias.remove(eliminando.id)
      toast(`Categoría “${eliminando.nombre}” eliminada`)
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Categorías</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Sectorizan a los socios según su aporte mensual. Cada socio queda en la categoría que contiene su monto y se
            usan para filtrar el listado y generar nóminas de cobro por grupo.
          </p>
        </div>
        <Button onClick={() => setEditando('nueva')}><Icon name="plus" /> Nueva categoría</Button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!data && !error && <div className="grid place-items-center p-16 text-brand-600"><Spinner className="size-7" /></div>}

      {data && data.socios_sin_categoria > 0 && (
        <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <Icon name="bell" className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p>
            <strong>{data.socios_sin_categoria} socio{data.socios_sin_categoria > 1 ? 's' : ''} activo{data.socios_sin_categoria > 1 ? 's' : ''}</strong> no
            calza{data.socios_sin_categoria > 1 ? 'n' : ''} en ninguna categoría. Revisa que los rangos cubran todos los montos.{' '}
            <a href="#/socios?categoria_id=sin" className="font-medium underline">Ver socios</a>
          </p>
        </div>
      )}

      {data && (data.datos.length === 0 ? (
        <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon name="tag" className="size-6" /></div>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">Aún no hay categorías</h3>
          <p className="mt-1 text-sm text-slate-500">Crea los rangos de aporte que usa la Fundación (por ejemplo: hasta $4.999, $5.000 a $9.999…).</p>
          <Button className="mt-4" onClick={() => setEditando('nueva')}><Icon name="plus" /> Nueva categoría</Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.datos.map((c) => {
            const pct = totalSocios ? Math.round((100 * c.socios_activos) / totalSocios) : 0
            return (
              <li key={c.id} className="flex flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge color={c.color}>{c.nombre}</Badge>
                    <p className="mt-2 text-sm text-slate-600">{rangoTexto(c)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setEditando(c)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700" aria-label={`Editar ${c.nombre}`}><Icon name="edit" /></button>
                    <button type="button" onClick={() => setEliminando(c)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600" aria-label={`Eliminar ${c.nombre}`}><Icon name="trash" /></button>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-slate-500">Socios activos</dt>
                    <dd className="text-xl font-semibold tabular-nums text-slate-900">{c.socios_activos.toLocaleString('es-CL')}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Aporte mensual</dt>
                    <dd className="text-xl font-semibold tabular-nums text-slate-900">{formatCLP(c.monto_mensual)}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center gap-2" title={`${pct}% de los socios activos`}>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${BARRA[c.color] ?? BARRA.gray}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
                </div>
                <a href={`#/socios?categoria_id=${c.id}`} className="mt-4 text-sm font-medium text-brand-700 hover:underline">Ver socios →</a>
              </li>
            )
          })}
        </ul>
      ))}

      <CategoriaForm
        open={editando !== null}
        categoria={editando === 'nueva' ? null : editando}
        onClose={() => setEditando(null)}
        onSaved={(c, nueva) => {
          toast(nueva ? `Categoría “${c.nombre}” creada` : 'Cambios guardados')
          setEditando(null)
          cargar()
        }}
      />
      <ConfirmDialog
        open={!!eliminando}
        title="Eliminar categoría"
        danger
        loading={borrando}
        confirmLabel="Eliminar"
        onClose={() => setEliminando(null)}
        onConfirm={eliminar}
        message={<p>¿Eliminar la categoría <strong className="text-slate-900">{eliminando?.nombre}</strong>? Los socios no se borran: solo quedan sin categoría hasta que otro rango los cubra.</p>}
      />
    </div>
  )
}

function CategoriaForm({ open, categoria, onClose, onSaved }) {
  const [f, setF] = useState({ nombre: '', monto_min: '', monto_max: '', color: 'gray' })
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setF(categoria
      ? { nombre: categoria.nombre, monto_min: String(categoria.monto_min), monto_max: categoria.monto_max == null ? '' : String(categoria.monto_max), color: categoria.color }
      : { nombre: '', monto_min: '', monto_max: '', color: 'gray' })
    setErrores({})
  }, [open, categoria])

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: k.startsWith('monto') ? e.target.value.replace(/\D/g, '') : e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const body = { ...f, monto_min: f.monto_min === '' ? null : Number(f.monto_min), monto_max: f.monto_max === '' ? null : Number(f.monto_max) }
      const r = categoria ? await api.categorias.update(categoria.id, body) : await api.categorias.create(body)
      onSaved(r.dato, !categoria)
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
      size="sm"
      title={categoria ? 'Editar categoría' : 'Nueva categoría'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="cat-form" loading={guardando}>Guardar</Button></>}
    >
      <form id="cat-form" onSubmit={guardar} noValidate className="space-y-4">
        {errores.general && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errores.general}</p>}
        <Field label="Nombre" required error={errores.nombre}>
          {(p) => <Input id={p.id} invalid={p.invalid} value={f.nombre} onChange={set('nombre')} placeholder="Ej: Socio Plata" maxLength={60} autoFocus />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde (CLP)" required error={errores.monto_min}>
            {(p) => <Input id={p.id} inputMode="numeric" invalid={p.invalid} value={f.monto_min} onChange={set('monto_min')} placeholder="5000" />}
          </Field>
          <Field label="Hasta (CLP)" error={errores.monto_max} hint="Vacío = sin tope">
            {(p) => <Input id={p.id} inputMode="numeric" invalid={p.invalid} aria-describedby={p.describedBy} value={f.monto_max} onChange={set('monto_max')} placeholder="9999" />}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Color</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(COLORES).map(([k, label]) => (
              <label key={k} className="cursor-pointer">
                <input type="radio" name="color" value={k} checked={f.color === k} onChange={set('color')} className="peer sr-only" />
                <Badge color={k} className="peer-checked:ring-2 peer-checked:ring-offset-1 peer-focus-visible:ring-2">{label}</Badge>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
