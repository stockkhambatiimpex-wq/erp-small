import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../state/AuthProvider.jsx'

export function LoginPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) nav('/', { replace: true })
  }, [user, nav])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setBusy(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    nav('/', { replace: true })
  }

  return (
    <div className="auth">
      <div className="authCard">
        <div className="authBrand">
          Khambati <span>Impex</span>
        </div>
        <div className="authTitle">Stock Manager</div>
        <form onSubmit={onSubmit} className="authForm">
          <label className="field">
            <div className="label">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              required
            />
          </label>
          <label className="field">
            <div className="label">Password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              required
            />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="btn btnPrimary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="authHint">
          Viewer accounts can only view. Editor can add/edit/adjust stock.
        </div>
      </div>
    </div>
  )
}

