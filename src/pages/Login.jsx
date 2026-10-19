import { useState } from 'react'
import { signIn, pedirNovaSenha } from '../lib/useAuth.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  // Link do e-mail vencido ou já usado: o Supabase devolve o erro no endereço.
  const [err, setErr] = useState(() => /error_code=otp_expired|error=access_denied/.test(window.location.hash + window.location.search) ? 'O link do e-mail expirou ou já foi usado. Peça um novo em "Esqueci minha senha".' : '')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [esqueci, setEsqueci] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setOk(''); setBusy(true)
    try {
      if (esqueci) {
        await pedirNovaSenha(email.trim())
        setOk('Se este e-mail tiver acesso, chega em instantes um link para criar a senha. Confira também o spam.')
      } else await signIn(email.trim(), senha)
    }
    catch (e2) { setErr(esqueci ? 'Não foi possível enviar agora. Aguarde um minuto e tente de novo.' : 'E-mail ou senha inválidos.') }
    finally { setBusy(false) }
  }

  return (
    <div className="login-screen">
      <div className="logo">Le Blanc</div>
      <div className="tag">Gestão integrada</div>
      <form className="login-card" onSubmit={submit}>
        {err && <div className="login-err" role="alert">{err}</div>}
        {ok && <div className="sub" role="status" style={{ marginBottom: 12 }}>{ok}</div>}
        <div className="field">
          <label>E-mail</label>
          <input className="input" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {!esqueci && <div className="field">
          <label>Senha</label>
          <input className="input" type="password" value={senha} autoComplete="current-password"
            onChange={(e) => setSenha(e.target.value)} required />
        </div>}
        <button className="btn" disabled={busy}>{busy ? 'Aguarde…' : esqueci ? 'Enviar link para criar a senha' : 'Entrar'}</button>
        <button type="button" className="btn ghost" style={{ marginTop: 8 }}
          onClick={() => { setEsqueci(!esqueci); setErr(''); setOk('') }}>
          {esqueci ? 'Voltar para o login' : 'Esqueci minha senha / primeiro acesso'}
        </button>
      </form>
      <div className="login-foot">Acesso restrito · use seu login cadastrado</div>
    </div>
  )
}
