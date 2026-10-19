import { useState } from 'react'
import { salvarNovaSenha, signOut } from '../lib/useAuth.js'

export default function DefinirSenha({ email, onPronto }) {
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (senha.length < 8) return setErr('Use pelo menos 8 caracteres.')
    if (senha !== conf) return setErr('As duas senhas não são iguais.')
    setBusy(true)
    try { await salvarNovaSenha(senha); onPronto() }
    catch (e2) { setErr('Não foi possível salvar. O link pode ter expirado: volte ao login e peça outro.') }
    finally { setBusy(false) }
  }

  return (
    <div className="login-screen">
      <div className="logo">Le Blanc</div>
      <div className="tag">Criar senha de acesso</div>
      <form className="login-card" onSubmit={submit}>
        {err && <div className="login-err" role="alert">{err}</div>}
        {email && <p className="sub" style={{ marginTop: 0 }}>{email}</p>}
        <div className="field">
          <label>Nova senha</label>
          <input className="input" type="password" value={senha} autoComplete="new-password"
            onChange={(e) => setSenha(e.target.value)} required />
        </div>
        <div className="field">
          <label>Repita a senha</label>
          <input className="input" type="password" value={conf} autoComplete="new-password"
            onChange={(e) => setConf(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha e entrar'}</button>
        <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={() => signOut().then(onPronto)}>Cancelar</button>
      </form>
    </div>
  )
}
