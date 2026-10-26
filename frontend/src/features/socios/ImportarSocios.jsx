import { useMemo, useState } from 'react'
import { utils, writeFile } from 'xlsx'
import * as api from '../../lib/api'
import { CAMPOS, construirFilas, descargarPlantilla, leerPlanilla } from '../../lib/excel'
import { formatRut } from '../../lib/rut'
import { formatCLP, formatFecha } from '../../lib/format'
import { Badge, Button, Icon, Modal, Select, Spinner, textoAccion } from '../../components/ui'
import { useToast } from '../../components/Toast'

const MAX_MB = 10
const ACCIONES = {
  crear: { label: 'Nuevos', color: 'green', singular: 'Nuevo' },
  actualizar: { label: 'Actualizar', color: 'blue', singular: 'Actualiza' },
  omitir: { label: 'Ya existen', color: 'gray', singular: 'Se omite' },
  error: { label: 'Con errores', color: 'red', singular: 'Error' },
}
const PASOS = ['Archivo', 'Columnas', 'Revisión', 'Listo']

export default function ImportarSocios({ open, onClose, onDone }) {
  const toast = useToast()
  const [paso, setPaso] = useState(0)
  const [archivo, setArchivo] = useState(null)
  const [planilla, setPlanilla] = useState(null)
  const [columnas, setColumnas] = useState([])
  const [medioPorDefecto, setMedioPorDefecto] = useState('')
  const [actualizarExistentes, setActualizarExistentes] = useState(false)
  const [revision, setRevision] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [arrastrando, setArrastrando] = useState(false)

  const reiniciar = () => {
    setPaso(0); setArchivo(null); setPlanilla(null); setColumnas([]); setMedioPorDefecto('')
    setActualizarExistentes(false); setRevision(null); setFiltro(''); setError('')
  }
  const cerrar = () => {
    if (cargando) return
    reiniciar()
    onClose()
  }

  const elegirArchivo = async (file) => {
    if (!file) return
    setError('')
    if (!/\.(xlsx|xls|csv|txt)$/i.test(file.name)) return setError('Formato no soportado. Usa .xlsx, .xls o .csv.')
    if (file.size > MAX_MB * 1024 * 1024) return setError(`El archivo supera ${MAX_MB} MB.`)
    setCargando(true)
    try {
      const p = await leerPlanilla(file)
      if (!p.datos.length) throw new Error('La planilla no tiene filas de datos.')
      setArchivo(file)
      setPlanilla(p)
      setColumnas(p.columnas)
      setPaso(1)
    } catch (e) {
      setError(e.message || 'No se pudo leer el archivo.')
    } finally {
      setCargando(false)
    }
  }

  const mapeados = new Set(columnas.map((c) => c.campo).filter(Boolean))
  const faltantes = CAMPOS.filter((c) => c.requerido && !mapeados.has(c.key) && !(c.key === 'medio_pago' && medioPorDefecto))

  const asignar = (indice, campo) =>
    setColumnas((cols) => cols.map((c) => (c.indice === indice ? { ...c, campo } : c.campo === campo && campo ? { ...c, campo: '' } : c)))

  const enviar = async (simular) => {
    setCargando(true)
    setError('')
    try {
      const filas = construirFilas(planilla.datos, columnas, { medioPorDefecto })
      const r = await api.socios.importar(filas, { simular, actualizarExistentes })
      setRevision(r)
      if (simular) {
        setFiltro(r.conteo.error ? 'error' : '')
        setPaso(2)
      } else {
        setPaso(3)
        onDone()
        toast(`Importación completada: ${r.conteo.crear} nuevos, ${r.conteo.actualizar} actualizados`)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  const filasVisibles = useMemo(() => {
    if (!revision) return []
    return filtro ? revision.filas.filter((f) => f.accion === filtro) : revision.filas
  }, [revision, filtro])

  const descargarErrores = () => {
    const filas = revision.filas
      .filter((f) => f.accion === 'error')
      .map((f) => ({ Fila: f.fila, RUT: f.rut ?? '', Nombre: f.nombre ?? '', Errores: Object.values(f.errores ?? {}).join(' | ') }))
    const wb = utils.book_new()
    utils.book_append_sheet(wb, utils.json_to_sheet(filas), 'Errores')
    writeFile(wb, 'errores_importacion.xlsx')
  }

  const aImportar = revision ? revision.conteo.crear + revision.conteo.actualizar : 0

  let footer = null
  if (paso === 0) {
    footer = <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
  } else if (paso === 1) {
    footer = (
      <>
        <Button variant="secondary" onClick={reiniciar}>Elegir otro archivo</Button>
        <Button onClick={() => enviar(true)} loading={cargando} disabled={faltantes.length > 0}>Revisar datos</Button>
      </>
    )
  } else if (paso === 2) {
    footer = (
      <>
        <Button variant="secondary" onClick={() => setPaso(1)} disabled={cargando}>Volver</Button>
        <Button onClick={() => enviar(false)} loading={cargando} disabled={aImportar === 0}>
          Importar {aImportar.toLocaleString('es-CL')} socio{aImportar === 1 ? '' : 's'}
        </Button>
      </>
    )
  } else {
    footer = <Button onClick={cerrar}>Terminar</Button>
  }

  return (
    <Modal open={open} onClose={cerrar} title="Importar socios desde Excel" size="xl" footer={footer}>
      <ol className="mb-6 flex items-center gap-2 text-xs font-medium sm:text-sm">
        {PASOS.map((p, i) => (
          <li key={p} className="flex items-center gap-2">
            <span className={`grid size-6 place-items-center rounded-full text-xs ${i < paso ? 'bg-brand-600 text-white' : i === paso ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' : 'bg-slate-100 text-slate-500'}`}>
              {i < paso ? '✓' : i + 1}
            </span>
            <span className={i === paso ? 'text-slate-900' : 'hidden text-slate-500 sm:inline'}>{p}</span>
            {i < PASOS.length - 1 && <span className="h-px w-4 bg-slate-300 sm:w-8" />}
          </li>
        ))}
      </ol>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      {paso === 0 && (
        <div className="space-y-4">
          <label
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegirArchivo(e.dataTransfer.files[0]) }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition ${
              arrastrando ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
            }`}
          >
            {cargando ? <Spinner className="size-8 text-brand-600" /> : <Icon name="upload" className="size-9 text-slate-400" />}
            <span className="mt-3 text-sm font-semibold text-slate-900">Arrastra la planilla aquí o haz clic para elegirla</span>
            <span className="mt-1 text-xs text-slate-500">Excel (.xlsx, .xls) o CSV · máximo {MAX_MB} MB · hasta 5.000 filas</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="sr-only"
              onChange={(e) => { elegirArchivo(e.target.files[0]); e.target.value = '' }}
            />
          </label>
          <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>Las columnas se detectan automáticamente por su nombre (RUT, Nombre, Monto, Medio de pago…). Puedes ajustarlas en el siguiente paso.</p>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={descargarPlantilla}>
              <Icon name="download" /> Descargar plantilla
            </Button>
          </div>
        </div>
      )}

      {paso === 1 && planilla && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Icon name="file" className="size-5 text-slate-400" />
            <span className="font-medium text-slate-900">{archivo.name}</span>
            <span className="text-slate-500">· hoja “{planilla.nombreHoja}” · {planilla.datos.length.toLocaleString('es-CL')} filas</span>
            {!planilla.conEncabezado && <Badge color="yellow">Sin encabezados: columnas detectadas por contenido</Badge>}
          </div>

          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Columna de la planilla</th>
                  <th className="px-4 py-2.5">Ejemplos</th>
                  <th className="px-4 py-2.5">Se importa como</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {columnas.map((c) => (
                  <tr key={c.indice} className={c.campo ? '' : 'bg-slate-50/60'}>
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-800">{c.titulo}</td>
                    <td className="max-w-xs truncate px-4 py-2 text-slate-500">
                      {planilla.datos.slice(0, 3).map((d) => d.valores[c.indice]).filter((v) => v !== '' && v != null).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-2">
                      <Select aria-label={`Campo para ${c.titulo}`} value={c.campo} onChange={(e) => asignar(c.indice, e.target.value)} className="min-w-52 py-1.5">
                        <option value="">— No importar —</option>
                        {CAMPOS.map((f) => <option key={f.key} value={f.key}>{f.label}{f.requerido ? ' *' : ''}</option>)}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl p-4 ring-1 ring-slate-200">
              <label className="block text-sm font-medium text-slate-700" htmlFor="medio-defecto">Medio de pago para filas sin dato</label>
              <p className="mb-2 text-xs text-slate-500">Útil si la planilla viene solo del banco (PAC) o solo de Transbank (PAT).</p>
              <Select id="medio-defecto" value={medioPorDefecto} onChange={(e) => setMedioPorDefecto(e.target.value)}>
                <option value="">Ninguno (la columna es obligatoria)</option>
                <option value="PAC">PAC · Cargo en cuenta bancaria</option>
                <option value="PAT">PAT · Tarjeta (Transbank)</option>
              </Select>
            </div>
            <label className="flex cursor-pointer gap-3 rounded-xl p-4 ring-1 ring-slate-200">
              <input type="checkbox" checked={actualizarExistentes} onChange={(e) => setActualizarExistentes(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="block text-sm font-medium text-slate-700">Actualizar socios que ya existen</span>
                <span className="block text-xs text-slate-500">Si el RUT ya está registrado, se reemplazan solo las columnas que vienen con datos. Si no lo marcas, esas filas se omiten.</span>
              </span>
            </label>
          </div>

          {faltantes.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              Falta indicar qué columna corresponde a: <strong>{faltantes.map((f) => f.label).join(', ')}</strong>.
            </p>
          )}
        </div>
      )}

      {(paso === 2 || paso === 3) && revision && (
        <div className="space-y-4">
          {paso === 3 ? (
            <div className="rounded-xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
              <p className="text-base font-semibold text-emerald-900">Importación completada</p>
              <p className="mt-1 text-sm text-emerald-800">
                {revision.conteo.crear} socios nuevos y {revision.conteo.actualizar} actualizados.
                {revision.conteo.error > 0 && ` ${revision.conteo.error} filas con errores no se importaron.`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Revisa el resultado antes de confirmar. <strong>Todavía no se ha guardado nada.</strong>
              {revision.conteo.error > 0 && ' Las filas con errores no se importarán; puedes corregirlas en la planilla y volver a cargarla.'}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <FiltroChip activo={filtro === ''} onClick={() => setFiltro('')}>Todas · {revision.filas.length}</FiltroChip>
            {Object.entries(ACCIONES).map(([k, a]) =>
              revision.conteo[k] > 0 ? (
                <FiltroChip key={k} activo={filtro === k} color={a.color} onClick={() => setFiltro(k)}>
                  {a.label} · {revision.conteo[k]}
                </FiltroChip>
              ) : null,
            )}
            {revision.conteo.error > 0 && (
              <button type="button" onClick={descargarErrores} className={`${textoAccion} ml-auto text-sm`}>
                <Icon name="download" /> Descargar errores
              </button>
            )}
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Fila</th>
                  <th className="px-4 py-2.5">RUT</th>
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5 text-right">Monto</th>
                  <th className="px-4 py-2.5">Medio</th>
                  <th className="px-4 py-2.5">Alta</th>
                  <th className="px-4 py-2.5">Resultado</th>
                  <th className="px-4 py-2.5">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filasVisibles.slice(0, 300).map((f) => (
                  <tr key={f.fila} className={f.accion === 'error' ? 'bg-red-50/40' : ''}>
                    <td className="px-4 py-2 tabular-nums text-slate-500">{f.fila}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{f.rut ? formatRut(f.rut) : '—'}</td>
                    <td className="max-w-56 truncate px-4 py-2">{f.nombre || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{f.monto ? formatCLP(f.monto) : '—'}</td>
                    <td className="px-4 py-2 text-xs">{f.medio_pago ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">{formatFecha(f.fecha_alta)}</td>
                    <td className="px-4 py-2"><Badge color={ACCIONES[f.accion].color}>{ACCIONES[f.accion].singular}</Badge></td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {f.errores ? (
                        <ul className="space-y-0.5 text-red-700">
                          {Object.entries(f.errores).map(([campo, msg]) => (
                            <li key={campo}><span className="font-medium">{CAMPOS.find((c) => c.key === campo)?.label ?? campo}:</span> {msg}</li>
                          ))}
                        </ul>
                      ) : (
                        f.mensaje ?? ''
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filasVisibles.length > 300 && (
              <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">Mostrando 300 de {filasVisibles.length.toLocaleString('es-CL')} filas.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function FiltroChip({ activo, color = 'gray', onClick, children }) {
  const colores = {
    gray: 'data-[on=true]:bg-slate-800 data-[on=true]:text-white',
    green: 'data-[on=true]:bg-emerald-600 data-[on=true]:text-white',
    blue: 'data-[on=true]:bg-sky-600 data-[on=true]:text-white',
    red: 'data-[on=true]:bg-red-600 data-[on=true]:text-white',
  }
  return (
    <button
      type="button"
      data-on={activo}
      onClick={onClick}
      aria-pressed={activo}
      className={`h-8 rounded-full bg-white px-3 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600 pointer-coarse:h-10 data-[on=true]:ring-transparent ${colores[color]}`}
    >
      {children}
    </button>
  )
}
