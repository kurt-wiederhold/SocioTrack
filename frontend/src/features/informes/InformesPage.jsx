import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../../lib/api'
import { formatCLP, periodoActual, sumarMes } from '../../lib/format'
import { Button, Icon, Select, Spinner } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { GraficoBarras, GraficoLinea } from './Graficos'

// Colores de serie validados (azul / naranja: separación OK para daltonismo y contraste ≥ 3:1).
const AZUL = 'var(--color-serie-1)'
const NARANJA = 'var(--color-serie-2)'

const AGRUPACIONES = [
  { id: 'mes', label: 'Mensual' },
  { id: 'trimestre', label: 'Trimestral' },
  { id: 'semestre', label: 'Semestral' },
  { id: 'anio', label: 'Anual' },
]
const PASO = { mes: 1, trimestre: 3, semestre: 6, anio: 12 }
const UNIDAD = { mes: 'meses', trimestre: 'trimestres', semestre: 'semestres', anio: 'años' }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const compacto = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 })
const clpEje = (v) => (v >= 1000 ? `$${compacto.format(v)}` : formatCLP(v))
const entero = (v) => Math.round(v).toLocaleString('es-CL')
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)

function rangoPreset(id, primer) {
  const actual = periodoActual()
  const anio = Number(actual.slice(0, 4))
  switch (id) {
    case 'anio': return [`${anio}-01`, actual]
    case 'anio_pasado': return [`${anio - 1}-01`, `${anio - 1}-12`]
    case 'tres_anios': return [`${anio - 2}-01`, actual]
    case 'todo': return [primer ?? `${anio}-01`, actual]
    default: return [sumarMes(actual, -11), actual] // últimos 12 meses
  }
}

/** Etiqueta del periodo que contiene un mes, según la agrupación. */
function etiquetaGrupo(mes, agrupacion) {
  const [y, m] = mes.split('-').map(Number)
  if (agrupacion === 'mes') return `${MESES[m - 1]} ${y}`
  if (agrupacion === 'trimestre') return `T${Math.floor((m - 1) / 3) + 1} ${y}`
  if (agrupacion === 'semestre') return `S${Math.floor((m - 1) / 6) + 1} ${y}`
  return String(y)
}

/** Lista de periodos elegibles (del más reciente al más antiguo) para el comparativo. */
function opcionesPeriodo(agrupacion, primer) {
  const out = []
  const paso = PASO[agrupacion]
  const [ya, ma] = periodoActual().split('-').map(Number)
  let y = ya
  let m = Math.floor((ma - 1) / paso) * paso + 1
  const limite = primer ?? `${ya}-01`
  for (let i = 0; i < 240; i++) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    out.push({ mes, label: etiquetaGrupo(mes, agrupacion) + (i === 0 ? ' (en curso)' : '') })
    if (mes <= limite) break
    m -= paso
    if (m < 1) { m += 12; y -= 1 }
  }
  return out
}

const METRICAS = [
  { key: 'altas', label: 'Altas (socios nuevos)', f: entero },
  { key: 'bajas', label: 'Bajas', f: entero },
  { key: 'neto', label: 'Crecimiento neto', f: (v) => (v > 0 ? `+${entero(v)}` : entero(v)) },
  { key: 'activos_cierre', label: 'Socios al cierre', f: entero },
  { key: 'monto_comprometido', label: 'Monto mensual comprometido', f: formatCLP },
  { key: 'socios_cobrados', label: 'Cobros exitosos', f: entero },
  { key: 'monto_cobrado', label: 'Monto cobrado', f: formatCLP },
  { key: 'monto_cobrado_pac', label: '· por PAC (banco)', f: formatCLP },
  { key: 'monto_cobrado_pat', label: '· por PAT (Transbank)', f: formatCLP },
  { key: 'tasa_cobro', label: 'Tasa de cobro', f: pct },
]

export default function InformesPage() {
  const toast = useToast()
  const [agrupacion, setAgrupacion] = useState('mes')
  const [rango, setRango] = useState('doce')
  const [personal, setPersonal] = useState(() => rangoPreset('doce'))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [primer, setPrimer] = useState(null)
  const [descargando, setDescargando] = useState(false)

  const [desde, hasta] = rango === 'personal' ? personal : rangoPreset(rango, primer)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    api.informes.generar({ agrupacion, desde, hasta }).then(
      (r) => { if (vigente) { setData(r); setPrimer(r.primer_periodo); setError('') } },
      (e) => { if (vigente) setError(e.message) },
    ).finally(() => vigente && setCargando(false))
    return () => { vigente = false }
  }, [agrupacion, desde, hasta])

  const t = data?.totales
  // Último comparativo visto, para incluirlo en el Excel. Callback estable: evita recargas en bucle.
  const comparativoRef = useRef(null)
  const guardarComparativo = useCallback((c) => { comparativoRef.current = c }, [])
  const descargar = async () => {
    setDescargando(true)
    try {
      const { exportarInforme } = await import('../../lib/excel')
      exportarInforme(data, METRICAS, comparativoRef.current)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setDescargando(false)
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Informes</h1>
          <p className="mt-1 text-sm text-slate-500">Altas, bajas y cobros por mes, trimestre, semestre o año, con comparación entre periodos.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()} disabled={!data}><Icon name="printer" /> Imprimir o PDF</Button>
          <Button onClick={descargar} loading={descargando} disabled={!data}>{!descargando && <Icon name="download" />} Descargar Excel</Button>
        </div>
      </div>

      {/* Filtros en una fila, sobre los gráficos */}
      <section className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 lg:flex-row lg:items-end print:hidden" aria-label="Filtros del informe">
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Agrupar por</legend>
          <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1" role="radiogroup">
            {AGRUPACIONES.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={agrupacion === a.id}
                onClick={() => setAgrupacion(a.id)}
                className={`h-9 rounded-md px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-600 pointer-coarse:h-11 ${
                  agrupacion === a.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block lg:w-56">
          <span className="mb-1 block text-sm font-medium text-slate-700">Rango</span>
          <Select value={rango} onChange={(e) => { if (e.target.value === 'personal') setPersonal([desde, hasta]); setRango(e.target.value) }}>
            <option value="doce">Últimos 12 meses</option>
            <option value="anio">Este año</option>
            <option value="anio_pasado">Año anterior</option>
            <option value="tres_anios">Últimos 3 años</option>
            <option value="todo">Todo el historial</option>
            <option value="personal">Personalizado…</option>
          </Select>
        </label>
        {rango === 'personal' && (
          <div className="flex flex-wrap gap-3">
            <SelectorMes label="Desde" valor={personal[0]} primer={primer} onChange={(v) => setPersonal(([, h]) => [v, v > h ? v : h])} />
            <SelectorMes label="Hasta" valor={personal[1]} primer={primer} onChange={(v) => setPersonal(([d]) => [v < d ? v : d, v])} />
          </div>
        )}
        {cargando && <Spinner className="size-5 self-center text-brand-600" />}
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!data && !error && <div className="grid place-items-center p-16 text-brand-600"><Spinner className="size-7" /></div>}

      {data && (
        <div className={`space-y-6 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <p className="text-sm text-slate-600">
            Periodo informado: <strong className="text-slate-900">{etiquetaGrupo(data.desde, 'mes')}</strong> a{' '}
            <strong className="text-slate-900">{etiquetaGrupo(data.hasta, 'mes')}</strong>
            {' · '}{data.periodos.length} {UNIDAD[agrupacion]}
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Altas" value={entero(t.altas)} />
            <Stat label="Bajas" value={entero(t.bajas)} />
            <Stat label="Crecimiento neto" value={t.neto > 0 ? `+${entero(t.neto)}` : entero(t.neto)} />
            <Stat label="Socios al cierre" value={entero(t.activos_cierre)} sub={`${formatCLP(t.monto_comprometido)} al mes`} />
            <Stat label="Monto cobrado" value={formatCLP(t.monto_cobrado)} sub={`${entero(t.socios_cobrados)} cobros exitosos`} />
            <Stat
              label="Tasa de cobro"
              value={pct(t.tasa_cobro)}
              sub={t.cargos_intentados ? `${entero(t.cargos_intentados)} con respuesta${t.cargos_pendientes ? ` · ${entero(t.cargos_pendientes)} esperando` : ''}` : 'Aún sin respuestas cargadas'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GraficoBarras
              titulo="Altas y bajas de socios"
              descripcion="Socios que se suman y que se van en cada periodo"
              datos={data.periodos}
              series={[{ key: 'altas', label: 'Altas', color: AZUL }, { key: 'bajas', label: 'Bajas', color: NARANJA }]}
              formato={entero}
              formatoEje={entero}
            />
            <GraficoBarras
              titulo="Monto cobrado"
              descripcion="Cobros exitosos según las respuestas cargadas"
              datos={data.periodos}
              series={[{ key: 'monto_cobrado_pac', label: 'PAC (banco)', color: AZUL }, { key: 'monto_cobrado_pat', label: 'PAT (Transbank)', color: NARANJA }]}
              apilado
              formato={formatCLP}
              formatoEje={clpEje}
            />
            <GraficoLinea
              titulo="Socios al cierre del periodo"
              descripcion="Socios vigentes (sin baja) al final de cada periodo"
              datos={data.periodos}
              campo="activos_cierre"
              color={AZUL}
              formato={entero}
            />
            <GraficoLinea
              titulo="Tasa de cobro"
              descripcion="Socios cobrados sobre socios con respuesta del banco o Transbank"
              datos={data.periodos.map((p) => ({ ...p, tasa: p.tasa_cobro == null ? null : p.tasa_cobro * 100 }))}
              campo="tasa"
              color={AZUL}
              formato={(v) => `${Math.round(v)}%`}
              desdeCero={false}
            />
          </div>

          <TablaDetalle data={data} />

          <Comparativo agrupacion={agrupacion} primer={primer} onDatos={guardarComparativo} />

          <p className="text-xs text-slate-500">
            Notas: los socios suspendidos cuentan como socios (no son bajas). El monto comprometido usa el aporte actual de cada socio.
            Lo cobrado proviene de las respuestas del banco y Transbank cargadas en Cobros.
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs leading-snug text-slate-500">{sub}</p>}
    </div>
  )
}

function SelectorMes({ label, valor, primer, onChange }) {
  const [y, m] = valor.split('-')
  const anioActual = Number(periodoActual().slice(0, 4))
  const primerAnio = Number((primer ?? periodoActual()).slice(0, 4))
  const anios = []
  for (let a = anioActual; a >= Math.min(primerAnio, anioActual - 1); a--) anios.push(a)
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">{label}</legend>
      {/* Anchos fijos que no se comprimen: "septiembre" (el mes más largo) se lee completo. */}
      <div className="flex gap-1">
        <div className="w-40 shrink-0">
          <Select aria-label={`${label}: mes`} value={m} onChange={(e) => onChange(`${y}-${e.target.value}`)} className="capitalize">
            {MESES.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{n}</option>)}
          </Select>
        </div>
        <div className="w-24 shrink-0">
          <Select aria-label={`${label}: año`} value={y} onChange={(e) => onChange(`${e.target.value}-${m}`)}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </div>
      </div>
    </fieldset>
  )
}

function TablaDetalle({ data }) {
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
      <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Detalle por periodo</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Periodo</th>
              <th className="px-4 py-2 text-right">Altas</th>
              <th className="px-4 py-2 text-right">Bajas</th>
              <th className="px-4 py-2 text-right">Neto</th>
              <th className="px-4 py-2 text-right">Socios al cierre</th>
              <th className="px-4 py-2 text-right">Comprometido</th>
              <th className="px-4 py-2 text-right">Cobrado</th>
              <th className="px-4 py-2 text-right">Tasa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {[...data.periodos].reverse().map((p) => (
              <tr key={p.clave}>
                <td className="whitespace-nowrap px-4 py-2 font-medium capitalize text-slate-900">{p.etiqueta}</td>
                <td className="px-4 py-2 text-right">{entero(p.altas)}</td>
                <td className="px-4 py-2 text-right">{entero(p.bajas)}</td>
                <td className="px-4 py-2 text-right">{p.neto > 0 ? `+${entero(p.neto)}` : entero(p.neto)}</td>
                <td className="px-4 py-2 text-right">{entero(p.activos_cierre)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{formatCLP(p.monto_comprometido)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{formatCLP(p.monto_cobrado)}</td>
                <td className="px-4 py-2 text-right">{pct(p.tasa_cobro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Comparativo entre dos periodos cualesquiera (mismo año o años anteriores). */
function Comparativo({ agrupacion, primer, onDatos }) {
  const opciones = useMemo(() => opcionesPeriodo(agrupacion, primer), [agrupacion, primer])
  // Por defecto: último periodo completo vs. el mismo periodo del año anterior.
  const porDefectoA = () => (opciones[1] ?? opciones[0]).mes
  const porDefectoB = () => {
    const [y, m] = porDefectoA().split('-')
    const mismoAnterior = `${Number(y) - 1}-${m}`
    return opciones.find((o) => o.mes === mismoAnterior)?.mes ?? opciones.at(-1).mes
  }
  const [a, setA] = useState(porDefectoA)
  const [b, setB] = useState(porDefectoB)
  const [res, setRes] = useState(null)

  // Al cambiar la agrupación, se vuelve a: periodo actual vs. el mismo periodo del año anterior.
  useEffect(() => {
    setA(porDefectoA())
    setB(porDefectoB())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agrupacion])

  useEffect(() => {
    let vigente = true
    setRes(null)
    Promise.all([a, b].map((p) => api.informes.generar({ agrupacion, desde: p, hasta: p }))).then(([ra, rb]) => {
      if (!vigente) return
      const r = { a: ra.periodos[0] ?? null, b: rb.periodos[0] ?? null, etiquetaA: etiquetaGrupo(a, agrupacion), etiquetaB: etiquetaGrupo(b, agrupacion) }
      setRes(r)
      onDatos(r)
    }, () => vigente && setRes({ error: true }))
    return () => { vigente = false }
  }, [a, b, agrupacion, onDatos])

  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 print:break-inside-avoid">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Comparar periodos</h2>
          <p className="text-xs text-slate-500">Elige dos periodos, del mismo año o de años anteriores.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 print:hidden">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Periodo A</span>
            <Select value={a} onChange={(e) => setA(e.target.value)} className="capitalize">
              {opciones.map((o) => <option key={o.mes} value={o.mes}>{o.label}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Periodo B</span>
            <Select value={b} onChange={(e) => setB(e.target.value)} className="capitalize">
              {opciones.map((o) => <option key={o.mes} value={o.mes}>{o.label}</option>)}
            </Select>
          </label>
        </div>
      </div>
      {!res ? (
        <div className="grid place-items-center p-8 text-brand-600"><Spinner className="size-6" /></div>
      ) : res.error ? (
        <p className="p-6 text-sm text-red-600">No se pudo cargar el comparativo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Indicador</th>
                <th className="px-4 py-2 text-right capitalize">{etiquetaGrupo(a, agrupacion)}</th>
                <th className="px-4 py-2 text-right capitalize">{etiquetaGrupo(b, agrupacion)}</th>
                <th className="px-4 py-2 text-right">Diferencia (A − B)</th>
                <th className="px-4 py-2 text-right">Variación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {METRICAS.map((mt) => {
                const va = res.a?.[mt.key] ?? null
                const vb = res.b?.[mt.key] ?? null
                const dif = va != null && vb != null ? va - vb : null
                const variacion = dif != null && vb ? dif / Math.abs(vb) : null
                const esPct = mt.key === 'tasa_cobro'
                return (
                  <tr key={mt.key}>
                    <td className="px-4 py-2 text-slate-700">{mt.label}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-slate-900">{va == null ? '—' : mt.f(va)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{vb == null ? '—' : mt.f(vb)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">
                      {dif == null ? '—' : esPct ? `${dif > 0 ? '+' : ''}${Math.round(dif * 100)} pts` : `${dif > 0 ? '+' : ''}${mt.f(dif)}`}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Variacion v={esPct ? null : variacion} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Variación con flecha + texto (no depende solo del color). */
function Variacion({ v }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-slate-400">—</span>
  const r = Math.round(v * 100)
  if (r === 0) return <span className="text-slate-500">= 0%</span>
  return (
    <span className="inline-flex items-center gap-0.5 font-medium text-slate-700">
      <span aria-hidden>{r > 0 ? '▲' : '▼'}</span>
      {r > 0 ? '+' : ''}{r}%
    </span>
  )
}
