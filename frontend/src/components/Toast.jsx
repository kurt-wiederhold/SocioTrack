import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(() => {})
let contador = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((mensaje, tipo = 'ok') => {
    const id = ++contador
    setToasts((t) => [...t, { id, mensaje, tipo }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
              t.tipo === 'error' ? 'bg-red-600 text-white ring-red-700' : 'bg-slate-900 text-white ring-slate-800'
            }`}
          >
            <span aria-hidden>{t.tipo === 'error' ? '⚠' : '✓'}</span>
            {t.mensaje}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
