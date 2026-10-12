import { useEffect, useState } from 'react'
import * as api from './lib/api'
import { Button, Icon, Spinner } from './components/ui'
import Login from './pages/Login'
import SociosPage from './features/socios/SociosPage'

export default function App() {
  const [usuario, setUsuario] = useState(undefined) // undefined = cargando

  useEffect(() => {
    api.setUnauthorizedHandler(() => setUsuario(null))
    api.me().then((r) => setUsuario(r.usuario), () => setUsuario(null))
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
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <SociosPage />
      </main>
    </div>
  )
}
