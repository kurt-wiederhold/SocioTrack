import { lazy, Suspense, useEffect, useState } from 'react'
import * as api from './lib/api'
import { Button, Icon, Spinner } from './components/ui'
import Login from './pages/Login'
import SociosPage from './features/socios/SociosPage'

const CobrosPage = lazy(() => import('./features/cobros/CobrosPage'))
const ProveedoresPage = lazy(() => import('./features/proveedores/ProveedoresPage'))
const CategoriasPage = lazy(() => import('./features/categorias/CategoriasPage'))

// Navegación simple por hash (#/socios, #/cobros...): no requiere configurar el servidor.
const SECCIONES = [
  { id: 'socios', label: 'Socios', icon: 'users', Componente: SociosPage },
  { id: 'cobros', label: 'Cobros', icon: 'card', Componente: CobrosPage },
  { id: 'proveedores', label: 'Proveedores', icon: 'building', Componente: ProveedoresPage },
  { id: 'categorias', label: 'Categorías', icon: 'tag', Componente: CategoriasPage },
]
const seccionActual = () => {
  const id = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return SECCIONES.some((s) => s.id === id) ? id : 'socios'
}

export default function App() {
  const [usuario, setUsuario] = useState(undefined) // undefined = cargando
  const [seccion, setSeccion] = useState(seccionActual)

  useEffect(() => {
    api.setUnauthorizedHandler(() => setUsuario(null))
    api.me().then((r) => setUsuario(r.usuario), () => setUsuario(null))
    const onHash = () => setSeccion(seccionActual())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (usuario === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center text-brand-600">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (!usuario) return <Login onLogin={setUsuario} />

  const salir = async () => {
    await api.logout().catch(() => {})
    setUsuario(null)
  }
  const { Componente } = SECCIONES.find((s) => s.id === seccion)

  return (
    <div className="min-h-dvh">
      <div className="brand-stripe h-1" />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src="./logo.png" alt="Africa Dream" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="hidden text-sm font-medium text-slate-500 sm:block">Gestión de socios</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 md:block">{usuario.nombre}</span>
            <Button variant="ghost" size="sm" onClick={salir}>
              <Icon name="logout" />
              Salir
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6 lg:px-8" aria-label="Secciones">
          <ul className="-mb-px flex gap-1">
            {SECCIONES.map((s) => (
              <li key={s.id}>
                <a
                  href={`#/${s.id}`}
                  aria-current={seccion === s.id ? 'page' : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
                    seccion === s.id
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                  }`}
                >
                  <Icon name={s.icon} />
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="grid place-items-center p-16 text-brand-600"><Spinner className="size-7" /></div>}>
          <Componente key={seccion} />
        </Suspense>
      </main>
    </div>
  )
}
