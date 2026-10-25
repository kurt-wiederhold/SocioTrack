import { useEffect, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, formatFecha, formatMes, hoyISO, ultimoMesProveedor } from '../../lib/format'
import { formatRut, normalizeRut } from '../../lib/rut'
import { Badge, Button, Field, Icon, Input, Modal, Select, Textarea } from '../../components/ui'
import { ProveedorForm } from '../proveedores/ProveedoresPage'
import { BANCOS, ESTADOS, MEDIOS } from './constants'

const VACIO = {
  rut: '', nombre: '', email: '', telefono: '', medio_pago: 'PAC', banco: '', monto: '', estado: 'activo',
  fecha_alta: '', fecha_baja: '', proveedor_id: '', proveedor_monto: '', proveedor_cuotas: '', proveedor_inicio: '', observaciones: '',
}

// Lleva el foco (y el scroll) al primer campo con error, tras el re-render.
const enfocarError = () =>
  requestAnimationFrame(() => {
    const el = document.querySelector('#socio-form [aria-invalid="true"], #socio-form [role="alert"]')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (el?.matches('input, select, textarea')) el.focus({ preventScroll: true })
  })

function desdeSocio(s) {
  if (!s) return { ...VACIO, fecha_alta: hoyISO() }
  const f = { ...VACIO }
  for (const k of Object.keys(VACIO)) f[k] = s[k] == null ? '' : String(s[k])
  f.rut = formatRut(s.rut)
  return f
}

function validarLocal(f, conProveedor) {
  const e = {}
  if (!f.rut.trim()) e.rut = 'El RUT es obligatorio.'
  else if (!normalizeRut(f.rut)) e.rut = 'RUT inválido (revisa el dígito verificador).'
  if (f.nombre.trim().length < 2) e.nombre = 'El nombre es obligatorio.'
  if (!/^\d+$/.test(String(f.monto)) || Number(f.monto) < 1) e.monto = 'Ingresa un monto en pesos, sin puntos.'
  if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Correo inválido.'
  if (conProveedor) {
    if (!f.proveedor_id) e.proveedor_id = 'Elige el proveedor.'
    if (f.proveedor_monto === '' || Number(f.proveedor_monto) < 0) e.proveedor_monto = 'Indica el pago mensual.'
    const meses = Number(f.proveedor_cuotas)
    if (!Number.isInteger(meses) || meses < 1 || meses > 120) e.proveedor_cuotas = 'Cantidad de meses (1 a 120).'
  }
  return e
}

export default function SocioForm({ socio, open, onClose, onSaved, onDelete }) {
  const [f, setF] = useState(VACIO)
  const [conProveedor, setConProveedor] = useState(false)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [proveedores, setProveedores] = useState([])
  const [creandoProveedor, setCreandoProveedor] = useState(false)
  const [inicial, setInicial] = useState(null)
  const [historial, setHistorial] = useState(null)

  useEffect(() => {
    if (!open) return
    const datos = desdeSocio(socio)
    setF(datos)
    setInicial({ datos, conProveedor: !!socio?.proveedor_id })
    setConProveedor(!!socio?.proveedor_id)
    setErrores({})
    setErrorGeneral('')
    setHistorial(null)
    api.proveedores.list().then((r) => setProveedores(r.datos), () => {})
    if (socio) api.socios.cobros(socio.id).then((r) => setHistorial(r.datos), () => setHistorial([]))
  }, [open, socio])

  // Evita perder lo escrito al cerrar sin querer (Esc, X, Cancelar o clic fuera).
  const hayCambios = inicial && (JSON.stringify(f) !== JSON.stringify(inicial.datos) || conProveedor !== inicial.conProveedor)
  const cerrar = () => {
    if (guardando) return
    if (hayCambios && !window.confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return
    onClose()
  }

  const set = (k) => (e) => {
    const v = e.target.value
    setF((prev) => ({ ...prev, [k]: v }))
    if (errores[k]) {
      setErrores((prev) => {
        const next = { ...prev }
        delete next[k]
        return next
      })
    }
  }

  const guardar = async (e) => {
    e.preventDefault()
    const local = validarLocal(f, conProveedor)
    setErrores(local)
    setErrorGeneral('')
    if (Object.keys(local).length) return enfocarError()

    const payload = { ...f }
    if (!conProveedor) {
      for (const k of ['proveedor_id', 'proveedor_monto', 'proveedor_cuotas', 'proveedor_inicio']) payload[k] = ''
    }
    if (payload.medio_pago !== 'PAC') payload.banco = ''
    if (payload.estado !== 'baja') payload.fecha_baja = ''

    setGuardando(true)
    try {
      const r = socio ? await api.socios.update(socio.id, payload) : await api.socios.create(payload)
      onSaved(r.dato, !socio)
    } catch (err) {
      setErrores(err.errores ?? {})
      setErrorGeneral(err.message)
      enfocarError()
    } finally {
      setGuardando(false)
    }
  }

  const finProveedor = conProveedor ? ultimoMesProveedor(f.proveedor_inicio || f.fecha_alta, f.proveedor_cuotas) : null
  const totalProveedor = Number(f.proveedor_monto) * Number(f.proveedor_cuotas)

  return (
    <>
    <Modal
      open={open}
      onClose={cerrar}
      title={socio ? 'Editar socio' : 'Nuevo socio'}
      description={socio ? `${socio.nombre} · ${formatRut(socio.rut)}` : 'Registro manual de un socio recurrente'}
      footer={
        <>
          {socio && onDelete && (
            <Button variant="danger-ghost" className="mr-auto" onClick={() => onDelete(socio)}>
              Eliminar
            </Button>
          )}
          <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="socio-form" loading={guardando}>
            {socio ? 'Guardar cambios' : 'Crear socio'}
          </Button>
        </>
      }
    >
      <form id="socio-form" onSubmit={guardar} noValidate className="space-y-8">
        {errorGeneral && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errorGeneral}</p>
        )}

        <Seccion titulo="Datos personales">
          <Field label="RUT" required error={errores.rut}>
            {(p) => (
              <Input
                id={p.id} invalid={p.invalid} aria-describedby={p.describedBy} placeholder="12.345.678-9" value={f.rut}
                onChange={set('rut')}
                onBlur={() => { const n = normalizeRut(f.rut); if (n) setF((x) => ({ ...x, rut: formatRut(n) })) }}
              />
            )}
          </Field>
          <Field label="Nombre completo" required error={errores.nombre}>
            {(p) => <Input id={p.id} invalid={p.invalid} aria-describedby={p.describedBy} value={f.nombre} onChange={set('nombre')} autoComplete="off" />}
          </Field>
          <Field label="Correo" error={errores.email}>
            {(p) => <Input id={p.id} type="email" invalid={p.invalid} aria-describedby={p.describedBy} value={f.email} onChange={set('email')} />}
          </Field>
          <Field label="Teléfono" error={errores.telefono}>
            {(p) => <Input id={p.id} type="tel" invalid={p.invalid} aria-describedby={p.describedBy} placeholder="+56 9 1234 5678" value={f.telefono} onChange={set('telefono')} />}
          </Field>
        </Seccion>

        <Seccion titulo="Aporte mensual">
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Medio de pago <span className="text-brand-600">*</span></span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio de pago">
              {Object.entries(MEDIOS).map(([k, m]) => (
                <label
                  key={k}
                  className={`flex cursor-pointer flex-col rounded-lg px-3 py-2.5 ring-1 transition ${
                    f.medio_pago === k ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input type="radio" name="medio_pago" value={k} checked={f.medio_pago === k} onChange={set('medio_pago')} className="sr-only" />
                  <span className="text-sm font-semibold text-slate-900">{m.label}</span>
                  <span className="text-xs text-slate-500">{m.detalle}</span>
                </label>
              ))}
            </div>
            {errores.medio_pago && <p className="mt-1 text-xs text-red-600">{errores.medio_pago}</p>}
          </div>
          {f.medio_pago === 'PAC' && (
            <Field label="Banco" error={errores.banco}>
              {(p) => (
                <>
                  <Input id={p.id} list="lista-bancos" invalid={p.invalid} value={f.banco} onChange={set('banco')} placeholder="Ej: Banco de Chile" />
                  <datalist id="lista-bancos">{BANCOS.map((b) => <option key={b} value={b} />)}</datalist>
                </>
              )}
            </Field>
          )}
          <Field label="Monto mensual (CLP)" required error={errores.monto} hint={f.monto && !errores.monto ? formatCLP(Number(f.monto)) : undefined}>
            {(p) => <Input id={p.id} inputMode="numeric" invalid={p.invalid} aria-describedby={p.describedBy} placeholder="5000" value={f.monto} onChange={(e) => set('monto')({ target: { value: e.target.value.replace(/\D/g, '') } })} />}
          </Field>
          <Field label="Estado" error={errores.estado}>
            {(p) => (
              <Select id={p.id} value={f.estado} onChange={set('estado')}>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Fecha de alta" error={errores.fecha_alta}>
            {(p) => <Input id={p.id} type="date" invalid={p.invalid} value={f.fecha_alta} onChange={set('fecha_alta')} />}
          </Field>
          {f.estado === 'baja' && (
            <Field label="Fecha de baja" error={errores.fecha_baja} hint="Si la dejas vacía se usa la fecha de hoy.">
              {(p) => <Input id={p.id} type="date" invalid={p.invalid} aria-describedby={p.describedBy} value={f.fecha_baja} onChange={set('fecha_baja')} />}
            </Field>
          )}
        </Seccion>

        <section>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={conProveedor} onChange={(e) => setConProveedor(e.target.checked)} className="mt-0.5 size-4 rounded border-slate-300 accent-brand-600" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Captado por un proveedor</span>
              <span className="block text-xs text-slate-500">La Fundación paga al proveedor una cuota mensual durante un número de meses. Al terminar, el socio pasa 100% a la Fundación.</span>
            </span>
          </label>
          {conProveedor && (
            <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-2">
              <Field label="Proveedor" required error={errores.proveedor_id}>
                {(p) => (
                  <div className="flex gap-2">
                    <Select id={p.id} invalid={p.invalid} aria-describedby={p.describedBy} value={f.proveedor_id} onChange={set('proveedor_id')}>
                      <option value="">Elige un proveedor…</option>
                      {proveedores
                        .filter((x) => x.activo || String(x.id) === String(f.proveedor_id))
                        .map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    </Select>
                    <Button variant="secondary" className="shrink-0" onClick={() => setCreandoProveedor(true)} aria-label="Crear proveedor nuevo">
                      <Icon name="plus" />
                    </Button>
                  </div>
                )}
              </Field>
              <Field label="Pago mensual al proveedor (CLP)" required error={errores.proveedor_monto}>
                {(p) => <Input id={p.id} inputMode="numeric" invalid={p.invalid} value={f.proveedor_monto} onChange={(e) => set('proveedor_monto')({ target: { value: e.target.value.replace(/\D/g, '') } })} />}
              </Field>
              <Field label="Meses a pagar" required error={errores.proveedor_cuotas}>
                {(p) => <Input id={p.id} type="number" min="1" max="120" invalid={p.invalid} value={f.proveedor_cuotas} onChange={set('proveedor_cuotas')} />}
              </Field>
              <Field label="Inicio del pago" error={errores.proveedor_inicio} hint="Por defecto, la fecha de alta.">
                {(p) => <Input id={p.id} type="date" invalid={p.invalid} aria-describedby={p.describedBy} value={f.proveedor_inicio} onChange={set('proveedor_inicio')} />}
              </Field>
              {finProveedor && (
                <p className="text-sm text-slate-600 sm:col-span-2">
                  Último pago al proveedor: <strong className="text-slate-900">{formatMes(finProveedor)}</strong>
                  {totalProveedor > 0 && <> · Total a pagar: <strong className="text-slate-900">{formatCLP(totalProveedor)}</strong></>}
                </p>
              )}
            </div>
          )}
        </section>

        <Field label="Observaciones" error={errores.observaciones}>
          {(p) => <Textarea id={p.id} rows={3} maxLength={1000} invalid={p.invalid} value={f.observaciones} onChange={set('observaciones')} />}
        </Field>

        {socio && <HistorialCobros historial={historial} />}

        {socio && (
          <p className="text-xs text-slate-500">
            Registrado el {formatFecha(socio.creado_en)} · última modificación {formatFecha(socio.actualizado_en)}
          </p>
        )}
      </form>
    </Modal>
    <ProveedorForm
      open={creandoProveedor}
      proveedor={null}
      onClose={() => setCreandoProveedor(false)}
      onSaved={(p) => {
        setProveedores((lista) => [...lista, { ...p, activo: true }].sort((a, b) => a.nombre.localeCompare(b.nombre)))
        setF((x) => ({ ...x, proveedor_id: String(p.id) }))
        setCreandoProveedor(false)
      }}
    />
    </>
  )
}

const ESTADO_COBRO = {
  cobrado: { label: 'Cobrado', color: 'green' },
  pendiente: { label: 'Esperando respuesta', color: 'yellow' },
  rechazado: { label: 'Rechazado', color: 'red' },
}

function HistorialCobros({ historial }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Historial de cobros</h3>
      {historial === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Aún no se ha incluido en ninguna nómina de cobro.</p>
      ) : (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
          {historial.map((h, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="w-20 font-medium capitalize text-slate-900">{formatMes(`${h.periodo}-01`)}</span>
              <Badge color={ESTADO_COBRO[h.estado].color}>{ESTADO_COBRO[h.estado].label}</Badge>
              <span className="text-xs text-slate-500">
                {h.medio_pago} envío {h.numero} · {h.intento === 1 ? 'envío original' : `reintento ${h.intento - 1}`} · {formatCLP(h.monto)}
                {h.motivo && ` · ${h.motivo}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Seccion({ titulo, children }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}
