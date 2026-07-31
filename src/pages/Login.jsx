import { useState } from 'react'
import { signIn } from '../lib/useAuth.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try { await signIn(email.trim(), senha) }
    catch (e2) { setErr('E-mail ou senha inválidos.') }
    finally { setBusy(false) }
  }

  return (
    <div className="login-screen">
      <div className="logo">Le Blanc</div>
      <div className="tag">Financeiro · Painel</div>
      <form className="login-card" onSubmit={submit}>
        {err && <div className="login-err">{err}</div>}
        <div className="field">
          <label>E-mail</label>
          <input className="input" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Senha</label>
          <input className="input" type="password" value={senha} autoComplete="current-password"
            onChange={(e) => setSenha(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <div className="login-foot">Acesso restrito · diretoria e administrativo</div>
    </div>
  )
}
