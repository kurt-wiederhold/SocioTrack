import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, formatFecha, formatPeriodo, periodoActual, sumarMes } from '../../lib/format'
import { formatRut } from '../../lib/rut'
import { Badge, Button, ConfirmDialog, Icon, IconButton, Input, Select, Spinner, textoAccion } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { GraficoBarras } from '../informes/Graficos'
import CargarArchivo from './CargarArchivo'
import { ESTADOS_DONANTE, ORIGENES } from './constants'

const excel = () => import('../../lib/excel')
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const compacto = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 })
const POR_PAGINA = 100
const SIN_FILTROS = { buscar: '', origen: '', estado: '', sinVinculo: false }

const TIPO_CONCLUSION = {
  accion: { icono: 'bell', etiqueta: 'Por hacer', clase: 'text-brand-700' },
  aviso: { icono: 'bell', etiqueta: 'Atención', clase: 'text-amber-700' },
  ok: { icono: 'check', etiqueta: 'Bien', clase: 'text-emerald-700' },
  info: { icono: 'chart', etiqueta: 'Dato', clase: 'text-slate-500' },
}

export default function ConsolidacionPage() {
  const toast = useToast()
  const [periodo, setPeriodo] = useState(periodoActual)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [cargandoArchivo, setCargandoArchivo] = useState(false)
  const [filtros, setFiltros] = useState(SIN_FILTROS)
  const [limite, setLimite] = useState(POR_PAGINA)
  const [eliminando, setEliminando] = useState(null)
  const [borrando, setBorrando] = useState(false)
  const tablaRef = useRef(null)
  const ultima = useRef(0)

  const cargar = useCallback(async () => {
    const n = ++ultima.current
    setCargando(true)
    try {
      const r = await api.consolidacion.ver(periodo)
      if (n === ultima.current) { setData(r); setError('') }
    } catch (e) {
      if (n === ultima.current) setError(e.message)
    } finally {
      if (n === ultima.current) setCargando(false)
    }
  }, [periodo])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { setLimite(POR_PAGINA) }, [filtros, periodo])

  const visibles = useMemo(() => {
    if (!data) return []
    const q = filtros.buscar.trim().toLowerCase()
    const qRut = q.replace(/[^0-9k]/g, '')
    return data.filas.filter((f) =>
      (!filtros.origen || f.origen === filtros.origen)
      && (!filtros.estado || f.estado === filtros.estado)
      && (!filtros.sinVinculo || (!f.rut && !f.socio_id))
      && (!q || f.nombre.toLowerCase().includes(q) || (qRut.length >= 3 && (f.rut ?? '').replace('-', '').toLowerCase().includes(qRut))))
  }, [data, filtros])

  const aplicarConclusion = (c) => {
    if (!c.filtro) return
    setFiltros({ ...SIN_FILTROS, estado: c.filtro.estado ?? '', origen: c.filtro.origen ?? '', sinVinculo: !!c.filtro.sin_vinculo })
    tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const eliminar = async () => {
    setBorrando(true)
    try {
      await api.consolidacion.eliminarLote(eliminando.id)
      toast(`Se deshizo la carga de ${eliminando.archivo}`)
      setEliminando(null)
      cargar()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBorrando(false)
    }
  }

  const t = data?.totales
  const hayFiltros = filtros.buscar || filtros.origen || filtros.estado || filtros.sinVinculo
  const hayDatos = data && (t.donantes > 0 || data.lotes.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Consolidación</h1>
          <p className="mt-1 text-sm text-slate-500">Todas las donaciones del mes en un solo lugar: a quién se le cobró y a quién no.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="marca" onClick={async () => (await excel()).descargarPlantillaTransferencias()} title="Planilla para registrar las transferencias directas">
            <Icon name="file" /> Plantilla transferencias
          </Button>
          <Button variant="secondary" disabled={!hayDatos} onClick={async () => (await excel()).exportarConsolidado(data, ORIGENES, ESTADOS_DONANTE)}>
            <Icon name="download" /> Exportar Excel
          </Button>
          <Button onClick={() => setCargandoArchivo(true)}><Icon name="upload" /> Cargar archivo</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
          <IconButton icon="chevronLeft" label="Mes anterior" onClick={() => setPeriodo((p) => sumarMes(p, -1))} />
          <span className="w-40 text-center text-sm font-semibold text-slate-900" aria-live="polite">{mayuscula(formatPeriodo(periodo))}</span>
          <IconButton icon="chevronRight" label="Mes siguiente" onClick={() => setPeriodo((p) => sumarMes(p, 1))} />
        </div>
        {periodo !== periodoActual() && (
          <button type="button" onClick={() => setPeriodo(periodoActual())} className={`${textoAccion} text-sm`}>Volver al mes actual</button>
        )}
        {cargando && data && <Spinner className="size-4 text-brand-600" />}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      {!data && !error && <div className="grid place-items-center p-16 text-brand-600"><Spinner className="size-7" /></div>}

      {data && !hayDatos && (
        <div className="rounded-xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon name="layers" className="size-6" /></div>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">Aún no hay información de {formatPeriodo(periodo)}</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">Carga la rendición del banco, la respuesta de Transbank y las planillas de Donar Online, Causaxcausa y transferencias.</p>
          <Button variant="secondary" className="mt-4" onClick={() => setCargandoArchivo(true)}><Icon name="upload" /> Cargar archivo</Button>
        </div>
      )}

      {hayDatos && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Cobrado" value={formatCLP(t.monto_cobrado)} sub={`${t.cobrados} donantes`} />
            <Stat label="No cobrado" value={formatCLP(t.monto_no_cobrado)} sub={`${t.rechazados} rechazados`} />
            <Stat label="Tasa de cobro" value={pct(t.tasa)} sub={t.pendientes ? `${t.pendientes} esperando respuesta` : 'Sobre donantes con respuesta'} />
            <Stat label="Socios sin enviar" value={t.sin_enviar} sub="Activos sin cobro este mes" />
          </div>

          {data.conclusiones.length > 0 && (
            <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Conclusiones del mes</h2>
              <ul className="space-y-2">
                {data.conclusiones.map((c, i) => {
                  const tipo = TIPO_CONCLUSION[c.tipo]
                  return (
                    <li key={i} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-slate-700">
                      <Icon name={tipo.icono} className={`mt-0.5 size-4 shrink-0 ${tipo.clase}`} />
                      <span className="min-w-0 flex-1"><span className="font-medium text-slate-900">{tipo.etiqueta}:</span> {c.texto}</span>
                      {c.filtro && <button type="button" className={`${textoAccion} text-xs`} onClick={() => aplicarConclusion(c)}>Ver quiénes</button>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Por origen</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-2">Origen</th><th className="px-4 py-2 text-right">Cobrado</th><th className="px-4 py-2 text-right">No cobrado</th><th className="px-4 py-2 text-right">Tasa</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {data.por_origen.map((o) => (
                      <tr key={o.origen} className={o.donantes ? '' : 'text-slate-400'}>
                        <td className="whitespace-nowrap px-4 py-2 font-medium">{o.etiqueta}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{o.donantes ? <>{formatCLP(o.monto_cobrado)} <span className="text-xs text-slate-500">({o.cobrados})</span></> : 'Sin cargar'}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{o.donantes ? <>{formatCLP(o.monto_no_cobrado)} <span className="text-xs text-slate-500">({o.rechazados})</span></> : '—'}</td>
                        <td className="px-4 py-2 text-right">{pct(o.tasa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <GraficoBarras
              titulo="Cobrado y no cobrado"
              datos={data.por_origen.filter((o) => o.donantes).map((o) => ({ ...o, clave: o.origen, etiqueta: ORIGENES[o.origen].corto }))}
              series={[{ key: 'monto_cobrado', label: 'Cobrado', color: 'var(--color-serie-1)' }, { key: 'monto_no_cobrado', label: 'No cobrado', color: 'var(--color-serie-2)' }]}
              apilado
              formato={formatCLP}
              formatoEje={(v) => (v >= 1000 ? `$${compacto.format(v)}` : formatCLP(v))}
            />
          </div>

          <section ref={tablaRef} className="scroll-mt-4 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="space-y-3 border-b border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input type="search" aria-label="Buscar donante" placeholder="Buscar por nombre o RUT…" className="pl-9" value={filtros.buscar} onChange={(e) => setFiltros((f) => ({ ...f, buscar: e.target.value }))} />
                </div>
                {hayFiltros && (
                  <Button variant="marca-suave" onClick={() => setFiltros(SIN_FILTROS)} className="self-start whitespace-nowrap"><Icon name="x" /> Limpiar filtros</Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                <Select aria-label="Origen" value={filtros.origen} onChange={(e) => setFiltros((f) => ({ ...f, origen: e.target.value }))}>
                  <option value="">Origen: todos</option>
                  {Object.entries(ORIGENES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
                <Select aria-label="Resultado" value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}>
                  <option value="">Resultado: todos</option>
                  {Object.entries(ESTADOS_DONANTE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </div>
            </div>

            {visibles.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500">Ningún donante coincide con los filtros.</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 md:hidden">
                  {visibles.slice(0, limite).map((f, i) => (
                    <li key={i} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{f.nombre}</p>
                          <p className="font-mono text-xs text-slate-500">{f.rut ? formatRut(f.rut) : 'Sin RUT'}</p>
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums text-slate-900">{formatCLP(f.monto)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge color={ESTADOS_DONANTE[f.estado].color}>{ESTADOS_DONANTE[f.estado].label}</Badge>
                        <Badge color={ORIGENES[f.origen].color}>{ORIGENES[f.origen].corto}</Badge>
                      </div>
                      {f.motivo && <p className="mt-1 text-xs text-slate-500">{f.motivo}</p>}
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr><th className="px-4 py-2">Donante</th><th className="px-4 py-2">RUT</th><th className="px-4 py-2">Origen</th><th className="px-4 py-2 text-right">Monto</th><th className="px-4 py-2">Resultado</th><th className="px-4 py-2 text-right">Envíos</th><th className="px-4 py-2">Detalle</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibles.slice(0, limite).map((f, i) => (
                        <tr key={i}>
                          <td className="max-w-56 truncate px-4 py-2 font-medium text-slate-900">{f.nombre}</td>
                          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-600">{f.rut ? formatRut(f.rut) : '—'}</td>
                          <td className="px-4 py-2"><Badge color={ORIGENES[f.origen].color}>{ORIGENES[f.origen].corto}</Badge></td>
                          <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formatCLP(f.monto)}</td>
                          <td className="px-4 py-2"><Badge color={ESTADOS_DONANTE[f.estado].color}>{ESTADOS_DONANTE[f.estado].label}</Badge></td>
                          <td className="px-4 py-2 text-right tabular-nums">{f.intentos || '—'}</td>
                          <td className="max-w-72 truncate px-4 py-2 text-xs text-slate-500" title={f.motivo ?? undefined}>{f.motivo ?? (f.codigo && f.estado === 'rechazado' ? `Código ${f.codigo}` : '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                  <span>{Math.min(limite, visibles.length).toLocaleString('es-CL')} de {visibles.length.toLocaleString('es-CL')} donantes</span>
                  {visibles.length > limite && <Button variant="secondary" size="sm" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</Button>}
                </div>
              </>
            )}
          </section>

          {data.lotes.length > 0 && (
            <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Archivos cargados este mes</h2>
              <ul className="divide-y divide-slate-100">
                {data.lotes.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                    <Badge color={ORIGENES[l.origen].color}>{ORIGENES[l.origen].corto}</Badge>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{l.archivo}</span>
                    <span className="text-xs text-slate-500">{l.filas} filas · {l.tipo === 'subida' ? 'enviado' : 'resultado'} · {formatFecha(l.creado_en)}</span>
                    <IconButton icon="trash" tone="danger" label={`Deshacer la carga de ${l.archivo}`} onClick={() => setEliminando(l)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {cargandoArchivo && (
        <CargarArchivo
          periodoInicial={periodo}
          onClose={() => setCargandoArchivo(false)}
          onCargado={(p) => {
            setCargandoArchivo(false)
            if (p === periodo) cargar()
            else setPeriodo(p)
          }}
        />
      )}
      <ConfirmDialog
        open={!!eliminando}
        title="Deshacer carga"
        danger
        loading={borrando}
        confirmLabel="Deshacer carga"
        onClose={() => setEliminando(null)}
        onConfirm={eliminar}
        message={<p>¿Quitar los resultados de <strong className="text-slate-900">{eliminando?.archivo}</strong> de este mes? Los socios que se crearon con este archivo se conservan.</p>}
      />
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs leading-snug text-slate-500">{sub}</p>
    </div>
  )
}
