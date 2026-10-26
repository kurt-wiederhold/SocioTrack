import { useState } from 'react'
import * as api from '../lib/api'
import { Button, Field, Icon, Input } from '../components/ui'

export default function Login({ onLogin, aviso }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [verClave, setVerClave] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await api.me() // asegura un token CSRF fresco
      const r = await api.login(email, password)
      onLogin(r.usuario)
    } catch (err) {
      setError(err.message)
      setCargando(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="brand-stripe h-1.5" />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <img src="./logo.png" alt="Fundación Africa Dream" className="mx-auto h-16 w-auto" />
          <h1 className="mt-8 text-center text-xl font-semibold text-slate-900">Gestión de socios</h1>
          <p className="mt-1 text-center text-sm text-slate-500">Ingresa con tu cuenta de la Fundación</p>

          {aviso && !error && (
            <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-900 ring-1 ring-amber-200" role="status">{aviso}</p>
          )}
          <form onSubmit={enviar} className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <Field label="Correo">
              {(p) => (
                <Input id={p.id} type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
            </Field>
            <Field label="Contraseña">
              {(p) => (
                <div className="relative">
                  <Input id={p.id} type={verClave ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                  <button
                    type="button"
                    onClick={() => setVerClave((v) => !v)}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-600 pointer-coarse:w-12"
                    aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={verClave}
                  >
                    <Icon name="eye" />
                  </button>
                </div>
              )}
            </Field>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <Button type="submit" loading={cargando} className="w-full">
              Ingresar
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
