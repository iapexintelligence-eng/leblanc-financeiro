import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, authOn } from '../lib/supabase.js'
import { tokensNome } from '../lib/recebimentos.js'
import { jornadaDemo } from '../lib/jornadaDemo.js'

// Busca de cliente pelo nome, no topo de todas as telas: abre a ficha do cliente direto.
// Carrega a lista só quando a pessoa clica no campo (cada um vê os clientes que o seu acesso permite).
export default function BuscaCliente() {
  const nav = useNavigate()
  const [lista, setLista] = useState(null)
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const caixa = useRef(null)

  async function carregar() {
    if (lista) return
    if (!authOn) { setLista(jornadaDemo().dados.registros.map((r) => ({ id: r.id, tipo: r.tipo, contrato_id: r.contrato_id, cliente: r.dados.cliente_nome }))); return }
    const { data } = await supabase.from('jornada_registros').select('id, tipo, contrato_id, cliente:dados->>cliente_nome').in('tipo', ['pedido', 'assistencia']).limit(5000)
    setLista(data || [])
  }
  useEffect(() => {
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const achados = useMemo(() => {
    // No que a pessoa digita vale até a inicial ("ana c"); nos nomes, as palavras inteiras.
    const t = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    if (!t.length || !lista) return []
    const pedidos = lista.filter((r) => r.tipo === 'pedido')
    const assist = lista.filter((r) => r.tipo === 'assistencia')
    return pedidos.filter((r) => { const n = tokensNome(r.cliente); return t.every((x) => n.some((y) => y.startsWith(x))) })
      .sort((a, b) => (a.cliente || '').localeCompare(b.cliente || ''))
      .slice(0, 8)
      .map((r) => ({ ...r, assistencias: assist.filter((a) => a.contrato_id === r.contrato_id) }))
  }, [q, lista])

  const abrir = (id) => { setAberto(false); setQ(''); nav('/jornada?registro=' + encodeURIComponent(id)) }
  const tecla = (e) => {
    if (!achados.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, achados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); abrir(achados[ativo].id) }
    else if (e.key === 'Escape') setAberto(false)
  }

  return <div ref={caixa} className="busca-cliente">
    <input className="input" type="search" placeholder="Buscar cliente pelo nome" aria-label="Buscar cliente pelo nome" value={q}
      onFocus={() => { carregar(); setAberto(true) }} onChange={(e) => { setQ(e.target.value); setAtivo(0); setAberto(true) }} onKeyDown={tecla} />
    {aberto && q.trim().length >= 2 && <div className="busca-cliente-lista" role="listbox">
      {lista === null ? <div className="faint" style={{ padding: 10 }}>Carregando…</div>
        : achados.length === 0 ? <div className="faint" style={{ padding: 10 }}>Nenhum cliente com esse nome.</div>
        : achados.map((r, i) => <div key={r.id}>
          <button type="button" role="option" aria-selected={i === ativo} className={'busca-cliente-item' + (i === ativo ? ' ativo' : '')} onMouseEnter={() => setAtivo(i)} onClick={() => abrir(r.id)}>{r.cliente || 'Cliente sem nome'}</button>
          {r.assistencias.length > 0 && <button type="button" className="busca-cliente-sub" onClick={() => abrir(r.assistencias[0].id)}>Assistência{r.assistencias.length > 1 ? `s (${r.assistencias.length})` : ''} deste cliente</button>}
        </div>)}
    </div>}
  </div>
}
