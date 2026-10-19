import { useEffect, useState } from 'react'
import { supabase, authOn } from './supabase.js'

// Link de "esqueci minha senha" ou de convite: a pessoa chega com o token no endereço
// e precisa criar a senha antes de usar o sistema. Lido ao carregar, antes de o Supabase limpar o endereço.
const veioPeloLink = typeof window !== 'undefined' && /type=(recovery|invite)/.test(window.location.hash + window.location.search)

export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(authOn)
  const [definirSenha, setDefinirSenha] = useState(authOn && veioPeloLink)

  useEffect(() => {
    if (!authOn) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setDefinirSenha(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, loading, authOn, definirSenha, senhaDefinida: () => setDefinirSenha(false) }
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function pedirNovaSenha(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' })
  if (error) throw error
}

export async function salvarNovaSenha(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
}
