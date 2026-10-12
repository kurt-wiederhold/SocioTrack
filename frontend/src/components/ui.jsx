import { useEffect, useId, useRef } from 'react'

const cx = (...c) => c.filter(Boolean).join(' ')

const VARIANTES = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 shadow-sm',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  'danger-ghost': 'text-red-600 hover:bg-red-50 hover:text-red-700',
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-2.5 py-1.5 text-sm' : 'px-3.5 py-2 text-sm',
        VARIANTES[variant],
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

export function Spinner({ className = 'size-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const inputBase =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset disabled:bg-slate-50 disabled:text-slate-500'

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
            <button
              type="button"
              onClick={onClose}
              className="-m-1.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Cerrar"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6 rounded-b-2xl">{footer}</div>}
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
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[name]} />
    </svg>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', danger, loading, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  )
}
