import { useEffect, useState } from 'react'
import { supabase, authOn } from './supabase.js'

// Papéis: administrativo, diretoria (veem tudo) · correcao, montagem, qualidade, vendedor (só o seu)
export const PAPEIS = ['logistica', 'financeiro', 'gestor', 'montador', 'administrativo', 'diretoria', 'correcao', 'montagem', 'qualidade', 'vendedor']
export const SETORES = ['Administrativo', 'Diretoria', 'Correção', 'Montagem', 'Qualidade', 'Vendas']
export const podeTudo = (papel) => papel === 'administrativo' || papel === 'diretoria' || papel === 'gestor' || papel === 'financeiro'

export function useRole() {
  const [role, setRole] = useState({ papel: null, setor: null, nome: '', email: '', loading: authOn })
  useEffect(() => {
    if (!authOn) { setRole({ papel: 'administrativo', setor: null, nome: 'Demo', email: '', loading: false }); return }
    (async () => {
      const { data: u } = await supabase.auth.getUser()
      const email = u?.user?.email
      if (!email) { setRole((r) => ({ ...r, loading: false })); return }
      const { data: j } = await supabase.from('jornada_acessos').select('papel,nome').eq('usuario_id',u.user.id).eq('ativo',true).maybeSingle()
      const { data } = await supabase.from('usuarios_sistema').select('*').eq('email', email).eq('ativo', true).maybeSingle()
      // Falha fechada: um usuário sem função não recebe acesso administrativo.
      setRole({ papel: j?.papel || data?.papel || null, setor: data?.setor || null, nome: j?.nome || data?.nome || email, email, loading: false })
    })()
  }, [])
  return role
}
