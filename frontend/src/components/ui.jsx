import { useEffect, useId, useRef } from 'react'

const cx = (...c) => c.filter(Boolean).join(' ')

const VARIANTES = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 shadow-sm',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  'danger-ghost': 'text-red-600 hover:bg-red-50 hover:text-red-700',
}

/*
 * Protocolo de botones (aplica en todas las pestañas):
 *  - Una sola acción principal (variant="primary") por pantalla o modal: el siguiente paso lógico.
 *  - Texto = verbo + objeto ("Guardar cambios", "Generar nómina").
 *  - Tamaño mínimo 36–40 px; 44 px en pantallas táctiles (pointer-coarse).
 *  - Destructivas en rojo, siempre con confirmación y separadas de la principal.
 *  - Mientras carga: spinner, aria-busy y deshabilitado (evita doble envío).
 *  - Solo ícono => IconButton (nombre accesible + texto al pasar el mouse).
 */
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:min-h-11',
        size === 'sm' ? 'h-9 px-3' : 'h-10 px-4',
        VARIANTES[variant],
        className,
      )}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

/** Botón de solo ícono: siempre con nombre accesible y texto al pasar el mouse. */
export function IconButton({ icon, label, tone = 'default', variant = 'ghost', loading, disabled, className, ...props }) {
  const tonos = {
    default: 'text-slate-500 hover:text-brand-700',
    danger: 'text-slate-500 hover:text-red-600 hover:bg-red-50',
  }
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      title={label}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className={cx(
        'inline-grid size-9 shrink-0 place-items-center rounded-lg transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:size-11',
        variant === 'secondary' ? 'bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50' : cx('hover:bg-slate-100', tonos[tone]),
        className,
      )}
    >
      {loading ? <Spinner className="size-4" /> : <Icon name={icon} className="size-5" />}
    </button>
  )
}

/** Enlace o botón de texto con área de toque cómoda (sin cambiar el diseño). */
export const textoAccion =
  'inline-flex items-center gap-1 rounded -my-2 py-2 font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-50 pointer-coarse:-my-3 pointer-coarse:py-3'

export function Spinner({ className = 'size-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const inputBase =
  'block min-h-10 w-full rounded-lg border-0 bg-white px-3 py-2 text-sm pointer-coarse:min-h-11 text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset disabled:bg-slate-50 disabled:text-slate-500'

export function Field({ label, error, hint, required, children, className }) {
  const id = useId()
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-brand-600">*</span>}
        </label>
      )}
      {children({ id, invalid: !!error, describedBy: error || hint ? `${id}-msg` : undefined })}
      {(error || hint) && (
        <p id={`${id}-msg`} className={cx('mt-1 text-xs', error ? 'text-red-600' : 'text-slate-500')}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export function Input({ invalid, className, ...props }) {
  return (
    <input
      className={cx(inputBase, invalid ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-brand-500', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

export function Select({ invalid, className, children, ...props }) {
  return (
    <select
      className={cx(inputBase, 'pr-8', invalid ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-brand-500', className)}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({ invalid, className, ...props }) {
  return (
    <textarea
      className={cx(inputBase, invalid ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-brand-500', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

const BADGES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  yellow: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
}

export function Badge({ color = 'gray', children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGES[color], className)}>
      {children}
    </span>
  )
}

/** Diálogo modal accesible basado en <dialog> nativo (Esc y foco incluidos). */
export function Modal({ open, onClose, title, description, children, footer, size = 'lg' }) {
  const ref = useRef(null)
  const pulsoEnFondo = useRef(false)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // Cierra al hacer clic en el fondo, pero no si el clic empezó dentro
      // (ej. seleccionar texto y soltar fuera), para no perder lo escrito.
      onMouseDown={(e) => (pulsoEnFondo.current = e.target === ref.current)}
      onClick={(e) => e.target === ref.current && pulsoEnFondo.current && onClose()}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-[2px]',
        size === 'sm' ? 'max-w-md' : size === 'xl' ? 'max-w-5xl' : 'max-w-2xl',
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <IconButton icon="x" label="Cerrar" onClick={onClose} className="-m-2" />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && <div className="flex flex-col gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:flex-wrap sm:justify-end sm:px-6 max-sm:[&>button]:w-full">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function Icon({ name, className = 'size-4' }) {
  const paths = {
    plus: 'M12 4.5v15m7.5-7.5h-15',
    upload: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5',
    download: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3',
    search: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
    edit: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125',
    trash: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
    bell: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
    users: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
    file: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z',
    logout: 'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9',
    chevronLeft: 'M15.75 19.5 8.25 12l7.5-7.5',
    chevronRight: 'm8.25 4.5 7.5 7.5-7.5 7.5',
    sort: 'M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9',
    card: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z',
    building: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
    tag: 'M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3ZM6 6h.008v.008H6V6Z',
    check: 'm4.5 12.75 6 6 9-13.5',
    eye: 'M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    x: 'M6 18 18 6M6 6l12 12',
    refresh: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[name]} />
    </svg>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger, loading, onConfirm, onClose, sinConfirmar }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant={sinConfirmar ? 'primary' : 'secondary'} onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          {!sinConfirmar && (
            <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          )}
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  )
}
