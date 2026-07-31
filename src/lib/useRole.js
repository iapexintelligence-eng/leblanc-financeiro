import { useEffect, useState } from 'react'
import { supabase, authOn } from './supabase.js'

// Papéis: administrativo, diretoria (veem tudo) · correcao, montagem, qualidade, vendedor (só o seu)
export const PAPEIS = ['administrativo', 'diretoria', 'correcao', 'montagem', 'qualidade', 'vendedor']
export const SETORES = ['Administrativo', 'Diretoria', 'Correção', 'Montagem', 'Qualidade', 'Vendas']
export const podeTudo = (papel) => papel === 'administrativo' || papel === 'diretoria'

export function useRole() {
  const [role, setRole] = useState({ papel: 'administrativo', setor: null, nome: '', email: '', loading: authOn })
  useEffect(() => {
    if (!authOn) { setRole({ papel: 'administrativo', setor: null, nome: 'Demo', email: '', loading: false }); return }
    (async () => {
      const { data: u } = await supabase.auth.getUser()
      const email = u?.user?.email
      if (!email) { setRole((r) => ({ ...r, loading: false })); return }
      const { data } = await supabase.from('usuarios_sistema').select('*').eq('email', email).eq('ativo', true).maybeSingle()
      // Fallback: e-mail ainda não cadastrado → tratado como administrativo (não trava o acesso atual)
      setRole({ papel: data?.papel || 'administrativo', setor: data?.setor || null, nome: data?.nome || email, email, loading: false })
    })()
  }, [])
  return role
}
