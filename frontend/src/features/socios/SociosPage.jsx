import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, formatFecha, formatMes, rangoTexto } from '../../lib/format'
import { formatRut } from '../../lib/rut'
import { Badge, Button, ConfirmDialog, Icon, Input, Select, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { ESTADOS, MEDIOS, PROVEEDOR_ESTADOS } from './constants'
import SocioForm from './SocioForm'

// La librería de Excel pesa ~400 KB: se carga solo cuando se usa.
const ImportarSocios = lazy(() => import('./ImportarSocios'))
const excel = () => import('../../lib/excel')

const FILTROS_INICIALES = {
  buscar: '', estado: '', medio_pago: '', categoria_id: '', proveedor_id: '', proveedor_estado: '',
  orden: 'nombre', dir: 'asc', pagina: 1, por_pagina: 25,
}

// Otras secciones enlazan con filtros: #/socios?categoria_id=2, #/socios?proveedor_id=1
function filtrosDesdeHash() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const f = { ...FILTROS_INICIALES }
  for (const k of ['estado', 'medio_pago', 'categoria_id', 'proveedor_id', 'proveedor_estado']) {
    if (q.get(k)) f[k] = q.get(k)
  }
  return f
}

export default function SociosPage() {
  const toast = useToast()
  const [filtros, setFiltros] = useState(filtrosDesdeHash)
  const [categorias, setCategorias] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [revisando, setRevisando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null) // null | 'nuevo' | socio
  const [importando, setImportando] = useState(false)
  const [eliminando, setEliminando] = useState(null)
  const [borrandoCargando, setBorrandoCargando] = useState(false)
  const [exportando, setExportando] = useState(false)

  const ultimaPeticion = useRef(0)
  const cargar = useCallback(async () => {
    const n = ++ultimaPeticion.current
    setCargando(true)
    try {
      const r = await api.socios.list(filtros)
      if (n !== ultimaPeticion.current) return // llegó una respuesta más nueva
      // Si la página quedó vacía (ej. se eliminó el último socio de la última página), ir a la anterior.
      if (r.datos.length === 0 && r.total > 0 && filtros.pagina > 1) {
        setFiltros((f) => ({ ...f, pagina: Math.ceil(r.total / r.por_pagina) }))
        return
      }
      setData(r)
      setError('')
    } catch (e) {
      if (n === ultimaPeticion.current) setError(e.message)
    } finally {
      if (n === ultimaPeticion.current) setCargando(false)
    }
  }, [filtros])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    api.categorias.list().then((r) => setCategorias(r.datos), () => {})
    api.proveedores.list().then((r) => setProveedores(r.datos), () => {})
  }, [])

  // Búsqueda con pequeña espera para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.buscar === busqueda ? f : { ...f, buscar: busqueda, pagina: 1 })), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const filtrar = (k, v) => setFiltros((f) => ({ ...f, [k]: v, pagina: 1 }))
  const ordenar = (col) =>
    setFiltros((f) => ({ ...f, orden: col, dir: f.orden === col && f.dir === 'asc' ? 'desc' : 'asc', pagina: 1 }))
  const hayFiltros = filtros.buscar || filtros.estado || filtros.medio_pago || filtros.categoria_id || filtros.proveedor_id || filtros.proveedor_estado
  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltros((f) => ({ ...FILTROS_INICIALES, orden: f.orden, dir: f.dir, por_pagina: f.por_pagina }))
    if (window.location.hash.includes('?')) window.history.replaceState(null, '', '#/socios')
  }
  const proveedorFiltrado = proveedores.find((p) => String(p.id) === String(filtros.proveedor_id))

  const marcarRevisados = async () => {
    setRevisando(true)
    try {
      const r = await api.socios.revisarAlertas()
      toast(`${r.marcados} alerta${r.marcados === 1 ? '' : 's'} marcada${r.marcados === 1 ? '' : 's'} como revisada${r.marcados === 1 ? '' : 's'}`)
      if (filtros.proveedor_estado === 'por_revisar') filtrar('proveedor_estado', '')
      else cargar()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setRevisando(false)
    }
  }

  const eliminar = async () => {
    setBorrandoCargando(true)
    try {
      await api.socios.remove(eliminando.id)
      toast(`Se eliminó a ${eliminando.nombre}`)
      setEliminando(null)
      cargar()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBorrandoCargando(false)
    }
  }

  const exportar = async () => {
    setExportando(true)
    try {
      const r = await api.socios.list({ ...filtros, pagina: 1, por_pagina: 20000 })
      const { exportarSocios } = await excel()
      exportarSocios(r.datos)
      if (r.total > r.datos.length) toast(`Se exportaron ${r.datos.length} de ${r.total} socios (máximo por archivo).`, 'error')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setExportando(false)
    }
  }

  const resumen = data?.resumen
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.por_pagina)) : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Socios</h1>
          <p className="mt-1 text-sm text-slate-500">Registro de socios recurrentes, su medio de pago y el proveedor que los captó.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setImportando(true)}>
            <Icon name="upload" /> Importar Excel
          </Button>
          <Button onClick={() => setEditando('nuevo')}>
            <Icon name="plus" /> Nuevo socio
          </Button>
        </div>
      </div>

      {resumen && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Socios activos" value={resumen.activos.toLocaleString('es-CL')} sub={`${resumen.total.toLocaleString('es-CL')} registrados`} />
          <Stat label="Aporte mensual activo" value={formatCLP(resumen.monto_mensual)} sub="Suma de socios activos" />
          <Stat label="Suspendidos / bajas" value={`${resumen.suspendidos} / ${resumen.bajas}`} sub="No se cobran" />
          <Stat
            label="Pagando a proveedores"
            value={resumen.proveedor_pagando.toLocaleString('es-CL')}
            sub={`${formatCLP(resumen.proveedor_monto_mensual)} al mes`}
          />
        </div>
      )}

      {resumen?.proveedor_por_revisar > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Icon name="check" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-900">
              {resumen.proveedor_por_revisar > 1 ? (
                <><strong>{resumen.proveedor_por_revisar} socios</strong> terminaron de pagarse al proveedor y ahora aportan <strong>100% a la Fundación</strong>.</>
              ) : (
                <><strong>1 socio</strong> terminó de pagarse al proveedor y ahora aporta <strong>100% a la Fundación</strong>.</>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" onClick={() => filtrar('proveedor_estado', 'por_revisar')}>Ver socios</Button>
            <Button size="sm" loading={revisando} onClick={marcarRevisados}><Icon name="check" /> Marcar revisados</Button>
          </div>
        </div>
      )}

      {resumen?.proveedor_ultimo_mes > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Icon name="bell" className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-900">
              <strong>{resumen.proveedor_ultimo_mes} socio{resumen.proveedor_ultimo_mes > 1 ? 's' : ''}</strong> paga
              {resumen.proveedor_ultimo_mes > 1 ? 'n' : ''} este mes la última cuota al proveedor. Desde el próximo mes su aporte
              será 100% para la Fundación.
            </p>
          </div>
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => filtrar('proveedor_estado', 'ultimo_mes')}>
            Ver socios
          </Button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Buscar por nombre, RUT, correo o proveedor…"
              aria-label="Buscar socios"
              className="pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:flex">
            <Select aria-label="Estado" value={filtros.estado} onChange={(e) => filtrar('estado', e.target.value)} className="xl:w-40">
              <option value="">Estado: todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Select aria-label="Medio de pago" value={filtros.medio_pago} onChange={(e) => filtrar('medio_pago', e.target.value)} className="xl:w-40">
              <option value="">Medio: todos</option>
              {Object.entries(MEDIOS).map(([k, v]) => <option key={k} value={k}>{v.label} · {v.detalle}</option>)}
            </Select>
            <Select aria-label="Categoría" value={filtros.categoria_id} onChange={(e) => filtrar('categoria_id', e.target.value)} className="xl:w-44">
              <option value="">Categoría: todas</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({rangoTexto(c)})</option>)}
              <option value="sin">Sin categoría</option>
            </Select>
            <Select aria-label="Proveedor" value={filtros.proveedor_estado} onChange={(e) => filtrar('proveedor_estado', e.target.value)} className="xl:w-44">
              <option value="">Proveedor: todos</option>
              <option value="pagando">Pagando a proveedor</option>
              <option value="ultimo_mes">Último mes de pago</option>
              <option value="finalizado">100% Fundación</option>
              <option value="por_revisar">100% Fundación (sin revisar)</option>
              <option value="sin">Sin proveedor</option>
            </Select>
          </div>
          {proveedorFiltrado && (
            <span className="inline-flex items-center gap-1 self-start rounded-full bg-brand-50 py-1 pl-3 pr-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 xl:self-center">
              Proveedor: {proveedorFiltrado.nombre}
              <button type="button" onClick={() => filtrar('proveedor_id', '')} className="rounded-full px-1.5 hover:bg-brand-100" aria-label="Quitar filtro de proveedor">×</button>
            </span>
          )}
          {hayFiltros && (
            <button type="button" onClick={limpiarFiltros} className="self-start text-sm font-medium text-brand-700 hover:underline xl:self-center xl:whitespace-nowrap">
              Limpiar filtros
            </button>
          )}
        </div>

        {error ? (
          <div className="p-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={cargar}>Reintentar</Button>
          </div>
        ) : !data ? (
          <div className="grid place-items-center p-16 text-brand-600"><Spinner className="size-7" /></div>
        ) : data.datos.length === 0 ? (
          <EmptyState hayFiltros={hayFiltros} onLimpiar={limpiarFiltros} onNuevo={() => setEditando('nuevo')} onImportar={() => setImportando(true)} />
        ) : (
          <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          {/* Móvil: tarjetas */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {data.datos.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditando(s)} className="block w-full px-4 py-3 text-left active:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{s.nombre}</p>
                      <p className="font-mono text-xs text-slate-500">{formatRut(s.rut)}</p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-slate-900">{formatCLP(s.monto)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge color={ESTADOS[s.estado].color}>{ESTADOS[s.estado].label}</Badge>
                    <Badge color={MEDIOS[s.medio_pago].color}>{s.medio_pago}</Badge>
                    {s.categoria && <Badge color={s.categoria_color}>{s.categoria}</Badge>}
                    {s.proveedor_estado && (
                      <Badge color={PROVEEDOR_ESTADOS[s.proveedor_estado].color}>
                        {s.proveedor_estado === 'finalizado' ? '100% Fundación' : `${s.proveedor} ${s.proveedor_cuotas_transcurridas}/${s.proveedor_cuotas}`}
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {/* Tablet y escritorio: tabla */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <Th col="nombre" filtros={filtros} onSort={ordenar}>Socio</Th>
                  <Th col="rut" filtros={filtros} onSort={ordenar}>RUT</Th>
                  <th className="px-4 py-3">Medio</th>
                  <Th col="monto" filtros={filtros} onSort={ordenar} className="text-right">Monto</Th>
                  <Th col="estado" filtros={filtros} onSort={ordenar}>Estado</Th>
                  <Th col="proveedor_fin" filtros={filtros} onSort={ordenar}>Proveedor</Th>
                  <Th col="fecha_alta" filtros={filtros} onSort={ordenar}>Alta</Th>
                  <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.datos.map((s) => (
                  <tr key={s.id} className="group cursor-pointer hover:bg-slate-50" onClick={() => setEditando(s)}>
                    <td className="max-w-64 px-4 py-3">
                      <div className="truncate font-medium text-slate-900">{s.nombre}</div>
                      {s.email && <div className="truncate text-xs text-slate-500">{s.email}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{formatRut(s.rut)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge color={MEDIOS[s.medio_pago].color}>{s.medio_pago}</Badge>
                      {s.banco && <span className="ml-2 text-xs text-slate-500">{s.banco}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="font-medium tabular-nums text-slate-900">{formatCLP(s.monto)}</div>
                      {s.categoria && <Badge color={s.categoria_color} className="mt-0.5">{s.categoria}</Badge>}
                    </td>
                    <td className="px-4 py-3"><Badge color={ESTADOS[s.estado].color}>{ESTADOS[s.estado].label}</Badge></td>
                    <td className="px-4 py-3"><ProveedorCell s={s} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFecha(s.fecha_alta)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-brand-700 hover:shadow-sm"
                          onClick={(e) => { e.stopPropagation(); setEditando(s) }}
                          aria-label={`Editar a ${s.nombre}`}
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-red-600 hover:shadow-sm"
                          onClick={(e) => { e.stopPropagation(); setEliminando(s) }}
                          aria-label={`Eliminar a ${s.nombre}`}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>
                {((data.pagina - 1) * data.por_pagina + 1).toLocaleString('es-CL')}–
                {Math.min(data.pagina * data.por_pagina, data.total).toLocaleString('es-CL')} de {data.total.toLocaleString('es-CL')}
              </span>
              <button type="button" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline disabled:opacity-50" onClick={exportar} disabled={exportando}>
                <Icon name="download" /> {exportando ? 'Exportando…' : 'Exportar a Excel'}
              </button>
              <button type="button" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 hover:underline" onClick={async () => (await excel()).descargarPlantilla()}>
                <Icon name="file" /> Plantilla de importación
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Select aria-label="Filas por página" value={filtros.por_pagina} onChange={(e) => filtrar('por_pagina', Number(e.target.value))} className="w-auto py-1.5">
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
              </Select>
              <Button variant="secondary" size="sm" aria-label="Página anterior" disabled={data.pagina <= 1} onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina - 1 }))}>
                <Icon name="chevronLeft" />
              </Button>
              <span className="tabular-nums">{data.pagina} / {totalPaginas}</span>
              <Button variant="secondary" size="sm" aria-label="Página siguiente" disabled={data.pagina >= totalPaginas} onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina + 1 }))}>
                <Icon name="chevronRight" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <SocioForm
        socio={editando === 'nuevo' ? null : editando}
        open={editando !== null}
        onClose={() => setEditando(null)}
        onDelete={(s) => {
          setEditando(null)
          setEliminando(s)
        }}
        onSaved={(s, nuevo) => {
          toast(nuevo ? `Socio ${s.nombre} creado` : 'Cambios guardados')
          setEditando(null)
          cargar()
        }}
      />

      {importando && (
        <Suspense fallback={null}>
          <ImportarSocios open onClose={() => setImportando(false)} onDone={() => cargar()} />
        </Suspense>
      )}

      <ConfirmDialog
        open={!!eliminando}
        title="Eliminar socio"
        danger
        loading={borrandoCargando}
        confirmLabel="Eliminar definitivamente"
        onClose={() => setEliminando(null)}
        onConfirm={eliminar}
        message={
          <>
            <p>
              ¿Eliminar a <strong className="text-slate-900">{eliminando?.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
              Si el socio dejó de aportar, es mejor editarlo y cambiar su estado a <strong>Baja</strong>: así se mantiene en los informes de altas y bajas.
            </p>
          </>
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

function Th({ col, filtros, onSort, children, className = '' }) {
  const activo = filtros.orden === col
  return (
    <th className={`px-4 py-3 ${className}`} aria-sort={activo ? (filtros.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => onSort(col)} className={`inline-flex items-center gap-1 uppercase hover:text-slate-900 ${activo ? 'text-slate-900' : ''}`}>
        {children}
        <Icon name="sort" className={`size-3.5 ${activo ? 'opacity-100' : 'opacity-30'}`} />
      </button>
    </th>
  )
}

function ProveedorCell({ s }) {
  if (!s.proveedor) return <span className="text-slate-400">—</span>
  const est = PROVEEDOR_ESTADOS[s.proveedor_estado]
  const pct = Math.round((100 * s.proveedor_cuotas_transcurridas) / s.proveedor_cuotas)
  return (
    <div className="min-w-36">
      <div className="truncate text-slate-700">{s.proveedor}</div>
      {s.proveedor_estado === 'finalizado' ? (
        <Badge color="green" className="mt-1">{s.proveedor_por_revisar ? '● 100% Fundación (nuevo)' : est.label}</Badge>
      ) : (
        <div className="mt-1 flex items-center gap-2" title={`Último pago al proveedor: ${formatMes(s.proveedor_fin)}`}>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full ${s.proveedor_estado === 'ultimo_mes' ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-slate-500">
            {s.proveedor_cuotas_transcurridas}/{s.proveedor_cuotas}
          </span>
        </div>
      )}
    </div>
  )
}

function EmptyState({ hayFiltros, onLimpiar, onNuevo, onImportar }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon name="users" className="size-6" />
      </div>
      {hayFiltros ? (
        <>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">Sin resultados</h3>
          <p className="mt-1 text-sm text-slate-500">Ningún socio coincide con los filtros.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={onLimpiar}>Limpiar filtros</Button>
        </>
      ) : (
        <>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">Aún no hay socios</h3>
          <p className="mt-1 text-sm text-slate-500">Importa la planilla actual o agrega el primer socio a mano.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={onImportar}><Icon name="upload" /> Importar Excel</Button>
            <Button onClick={onNuevo}><Icon name="plus" /> Nuevo socio</Button>
          </div>
        </>
      )}
    </div>
  )
}
