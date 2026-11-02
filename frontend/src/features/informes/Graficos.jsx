// Gráficos SVG livianos para los informes.
// Especificación (guía de visualización): un solo eje, barras <= 24 px con extremo redondeado de 4 px
// apoyadas en la base, separación de 2 px entre segmentos, líneas de 2 px, punto final >= 8 px con
// anillo del color de fondo, grilla fina y discreta, leyenda para 2+ series, etiquetas selectivas
// (solo el último periodo), tooltip al pasar el mouse y tabla con los mismos datos en la página.
import { useLayoutEffect, useRef, useState } from 'react'

const ALTO = 220
const MARGEN = { arriba: 16, derecha: 16, abajo: 28, izquierda: 52 }

function useAncho() {
  const ref = useRef(null)
  // Se parte en 0 y se dibuja recién al medir el contenedor: así el gráfico nunca ensancha la página.
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, ancho]
}

/** Escala "redonda" para el eje: 0, 5, 10, 15... */
function escala(max) {
  if (max <= 0) return { tope: 4, paso: 1 }
  const bruto = max / 4
  const pot = 10 ** Math.floor(Math.log10(bruto))
  // Pasos 1-2-5: siempre enteros para cantidades de socios (nunca 2,5 socios).
  const paso = Math.max(1, [1, 2, 5, 10].map((f) => f * pot).find((p) => p >= bruto))
  return { tope: paso * Math.ceil(max / paso), paso }
}

/** Barra con extremo superior redondeado y base cuadrada. */
function barra(x, y, w, h) {
  if (h <= 0) return ''
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function Leyenda({ series }) {
  if (series.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

function Marco({ titulo, descripcion, series, children, vacio }) {
  return (
    <figure className="min-w-0 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 print:break-inside-avoid sm:p-5">
      <figcaption className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
          {descripcion && <p className="text-xs text-slate-500">{descripcion}</p>}
        </div>
        <Leyenda series={series} />
      </figcaption>
      {vacio ? <p className="grid h-40 place-items-center text-sm text-slate-400">Sin datos en este rango.</p> : children}
    </figure>
  )
}

function Tooltip({ x, ancho, titulo, filas }) {
  const izquierda = Math.min(Math.max(x, 70), ancho - 70)
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: izquierda }}
      role="status"
    >
      <p className="mb-1 font-semibold">{titulo}</p>
      {filas.map((f) => (
        <p key={f.label} className="flex items-center gap-2 whitespace-nowrap">
          {f.color && <span className="size-2 rounded-sm" style={{ background: f.color }} aria-hidden />}
          <span className="text-slate-300">{f.label}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{f.valor}</span>
        </p>
      ))}
    </div>
  )
}

function Ejes({ ancho, tope, paso, formatoEje }) {
  const h = ALTO - MARGEN.arriba - MARGEN.abajo
  const ticks = []
  for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v)
  return ticks.map((v) => {
    const y = MARGEN.arriba + h - (v / tope) * h
    return (
      <g key={v}>
        <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y} y2={y} stroke="var(--color-grilla)" strokeWidth="1" />
        <text x={MARGEN.izquierda - 8} y={y} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
          {formatoEje(v)}
        </text>
      </g>
    )
  })
}

function EtiquetasX({ datos, ancho, banda }) {
  const cada = Math.max(1, Math.ceil(datos.length / Math.max(1, Math.floor((ancho - MARGEN.izquierda) / 72))))
  const ultimo = datos.length - 1
  // Una etiqueta cada "cada" periodos; el último siempre se rotula y reemplaza a la anterior si quedaría encimada.
  const visibles = new Set()
  for (let i = 0; i <= ultimo; i += cada) visibles.add(i)
  if (!visibles.has(ultimo)) {
    visibles.delete(Math.floor(ultimo / cada) * cada)
    visibles.add(ultimo)
  }
  return datos.map((d, i) =>
    visibles.has(i) ? (
      <text key={d.clave} x={MARGEN.izquierda + banda * i + banda / 2} y={ALTO - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
        {d.etiqueta}
      </text>
    ) : null,
  )
}

/**
 * Barras agrupadas o apiladas.
 * datos: [{ clave, etiqueta, ...valores }]; series: [{ key, label, color }]
 */
export function GraficoBarras({ titulo, descripcion, datos, series, apilado = false, formato, formatoEje = formato }) {
  const [ref, ancho] = useAncho()
  const [hover, setHover] = useState(null)
  const total = (d) => series.reduce((a, s) => a + (d[s.key] || 0), 0)
  const max = Math.max(0, ...datos.map((d) => (apilado ? total(d) : Math.max(...series.map((s) => d[s.key] || 0)))))
  const { tope, paso } = escala(max)
  const h = ALTO - MARGEN.arriba - MARGEN.abajo
  const banda = (ancho - MARGEN.izquierda - MARGEN.derecha) / Math.max(1, datos.length)
  const yDe = (v) => MARGEN.arriba + h - (v / tope) * h
  const anchoBarra = apilado ? Math.min(24, banda * 0.6) : Math.min(24, (banda * 0.7 - 2 * (series.length - 1)) / series.length)
  const ultimo = datos.length - 1

  return (
    <Marco titulo={titulo} descripcion={descripcion} series={series} vacio={max === 0}>
      <div ref={ref} className="relative min-h-[220px] w-full" onMouseLeave={() => setHover(null)}>
        {ancho > 0 && <svg width={ancho} height={ALTO} role="img" aria-label={`${titulo}. Detalle en la tabla de resultados.`}>
          <Ejes ancho={ancho} tope={tope} paso={paso} formatoEje={formatoEje} />
          {datos.map((d, i) => {
            const x0 = MARGEN.izquierda + banda * i
            const centro = x0 + banda / 2
            let acumulado = 0
            return (
              <g key={d.clave}>
                {hover === i && <rect x={x0} y={MARGEN.arriba} width={banda} height={h} fill="var(--color-hover)" />}
                {series.map((s, j) => {
                  const v = d[s.key] || 0
                  if (apilado) {
                    const yTop = yDe(acumulado + v)
                    const alto = yDe(acumulado) - yTop
                    acumulado += v
                    const esTope = series.slice(j + 1).every((t) => !(d[t.key] > 0))
                    // 2 px de separación entre segmentos apilados
                    const altoVisible = esTope ? alto : Math.max(0, alto - 2)
                    return esTope
                      ? <path key={s.key} d={barra(centro - anchoBarra / 2, yTop, anchoBarra, altoVisible)} fill={s.color} />
                      : <rect key={s.key} x={centro - anchoBarra / 2} y={yTop + 2} width={anchoBarra} height={altoVisible} fill={s.color} />
                  }
                  const grupo = anchoBarra * series.length + 2 * (series.length - 1)
                  const x = centro - grupo / 2 + j * (anchoBarra + 2)
                  return <path key={s.key} d={barra(x, yDe(v), anchoBarra, yDe(0) - yDe(v))} fill={s.color} />
                })}
                {/* Etiqueta solo en el último periodo */}
                {i === ultimo && (apilado ? total(d) : null) > 0 && (
                  <text x={centro} y={yDe(total(d)) - 6} textAnchor="middle" className="fill-slate-700 text-[11px] font-medium tabular-nums">
                    {formatoEje(total(d))}
                  </text>
                )}
                <rect
                  x={x0} y={MARGEN.arriba} width={banda} height={h} fill="transparent"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  tabIndex={-1}
                />
              </g>
            )
          })}
          <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={yDe(0)} y2={yDe(0)} stroke="var(--color-eje)" strokeWidth="1" />
          <EtiquetasX datos={datos} ancho={ancho} banda={banda} />
        </svg>}
        {hover !== null && (
          <Tooltip
            x={MARGEN.izquierda + banda * hover + banda / 2}
            ancho={ancho}
            titulo={datos[hover].etiqueta}
            filas={[
              ...series.map((s) => ({ label: s.label, color: s.color, valor: formato(datos[hover][s.key] || 0) })),
              ...(apilado ? [{ label: 'Total', valor: formato(total(datos[hover])) }] : []),
            ]}
          />
        )}
      </div>
    </Marco>
  )
}

/** Línea de una serie con área suave, punto final y etiqueta del último valor. */
export function GraficoLinea({ titulo, descripcion, datos, campo, color, formato, formatoEje = formato, desdeCero = true }) {
  const [ref, ancho] = useAncho()
  const [hover, setHover] = useState(null)
  const valores = datos.map((d) => d[campo]).filter((v) => v != null)
  const max = Math.max(0, ...valores)
  const { tope, paso } = escala(max)
  const h = ALTO - MARGEN.arriba - MARGEN.abajo
  const banda = (ancho - MARGEN.izquierda - MARGEN.derecha) / Math.max(1, datos.length)
  const xDe = (i) => MARGEN.izquierda + banda * i + banda / 2
  const yDe = (v) => MARGEN.arriba + h - (v / tope) * h
  const puntos = datos.map((d, i) => (d[campo] == null ? null : [xDe(i), yDe(d[campo])]))
  const validos = puntos.filter(Boolean)
  const linea = validos.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')
  const area = validos.length ? `${linea}L${validos.at(-1)[0]},${yDe(0)}L${validos[0][0]},${yDe(0)}Z` : ''
  const fin = validos.at(-1)
  const ultimoValor = [...datos].reverse().find((d) => d[campo] != null)?.[campo]

  return (
    <Marco titulo={titulo} descripcion={descripcion} series={[]} vacio={!validos.length || (desdeCero && max === 0)}>
      <div ref={ref} className="relative min-h-[220px] w-full" onMouseLeave={() => setHover(null)}>
        {ancho > 0 && <svg width={ancho} height={ALTO} role="img" aria-label={`${titulo}. Detalle en la tabla de resultados.`}>
          <Ejes ancho={ancho} tope={tope} paso={paso} formatoEje={formatoEje} />
          <path d={area} fill={color} opacity="0.1" />
          <path d={linea} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && puntos[hover] && (
            <>
              <line x1={puntos[hover][0]} x2={puntos[hover][0]} y1={MARGEN.arriba} y2={yDe(0)} stroke="var(--color-eje)" strokeWidth="1" />
              <circle cx={puntos[hover][0]} cy={puntos[hover][1]} r="5" fill={color} stroke="white" strokeWidth="2" />
            </>
          )}
          {fin && (
            <>
              <circle cx={fin[0]} cy={fin[1]} r="4" fill={color} stroke="white" strokeWidth="2" />
              <text x={Math.min(fin[0], ancho - MARGEN.derecha - 4)} y={fin[1] - 10} textAnchor="end" className="fill-slate-700 text-[11px] font-medium tabular-nums">
                {formato(ultimoValor)}
              </text>
            </>
          )}
          {datos.map((d, i) => (
            <rect key={d.clave} x={MARGEN.izquierda + banda * i} y={MARGEN.arriba} width={banda} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
          <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={yDe(0)} y2={yDe(0)} stroke="var(--color-eje)" strokeWidth="1" />
          <EtiquetasX datos={datos} ancho={ancho} banda={banda} />
        </svg>}
        {hover !== null && (
          <Tooltip x={xDe(hover)} ancho={ancho} titulo={datos[hover].etiqueta}
            filas={[{ label: titulo, color, valor: datos[hover][campo] == null ? 'Sin datos' : formato(datos[hover][campo]) }]} />
        )}
      </div>
    </Marco>
  )
}
