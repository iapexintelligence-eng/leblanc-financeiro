import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import { useRole, podeTudo } from '../lib/useRole.js'
import { IcoSearch } from '../components/Icons.jsx'

const crm = supabase.schema('leblanc')
const ETAPA = {
  vendedor: { txt: 'Com o vendedor', cls: 'neutral' },
  correcao: { txt: 'Na correção', cls: 'warn' },
  liberacao: { txt: 'Liberação (financeiro)', cls: 'warn' },
  montagem: { txt: 'Montagem', cls: 'warn' },
  qualidade: { txt: 'Qualidade', cls: 'warn' },
  concluido: { txt: 'Concluído', cls: 'ok' },
}

export default function Acompanhamento() {
  const role = useRole()
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')

  const carregar = async () => {
    const [ct, fx] = await Promise.all([
      crm.from('contratos').select('id, numero, cliente_nome, vendor, valor_final, status, created_at').order('created_at', { ascending: false }).limit(300),
      crm.from('projeto_fluxo').select('*'),
    ])
    const fmap = Object.fromEntries((fx.data || []).map((f) => [f.contrato_id, f]))
    const merged = (ct.data || []).map((c) => ({ c, f: fmap[c.id] || { etapa: 'vendedor' } }))
    merged.sort((a, b) => (b.f.prioridade ? 1 : 0) - (a.f.prioridade ? 1 : 0))
    setRows(merged)
  }
  useEffect(() => { carregar() }, [])

  let lista = (rows || [])
  if (role.papel === 'vendedor' && role.nome) {
    const n = role.nome.toLowerCase()
    const mine = lista.filter((r) => (r.c.vendor || '').toLowerCase().includes(n.split(' ')[0]))
    if (mine.length) lista = mine // se casar pelo nome, mostra só os dele; senão mostra todos
  }
  lista = lista.filter((r) => !busca || (r.c.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.c.numero || '').includes(busca))
  const prioridades = lista.filter((r) => r.f.devolvido && r.f.etapa === 'vendedor')

  return (
    <>
      <div className="section-head">
        <div className="tools"><div className="search"><IcoSearch /><input className="input" placeholder="Buscar cliente / nº" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        {podeTudo(role.papel) && <span className="pill">Visão geral (todos os projetos)</span>}
      </div>

      {prioridades.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 18 }}>
          <h3 style={{ color: 'var(--danger)' }}>⚠ Prioridade — devolvidos pela correção ({prioridades.length})</h3>
          <div className="sub">Resolva o que falta e reenvie para a correção (na aba Contratos).</div>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {prioridades.map((r) => (
              <div key={r.c.id} className="between" style={{ borderLeft: '3px solid var(--danger)', paddingLeft: 12 }}>
                <div><b>{r.c.numero}</b> · {r.c.cliente_nome}</div>
                <div className="muted" style={{ fontSize: 13 }}>{r.f.devolucao_motivo}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nº</th><th>Cliente</th><th>Vendedor</th><th className="num">Valor</th><th>Etapa</th><th>Observação</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="6" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="6" className="empty">Nenhum projeto.</td></tr>}
            {lista.map((r) => {
              const e = ETAPA[r.f.etapa] || ETAPA.vendedor
              return (
                <tr key={r.c.id} style={r.f.devolvido && r.f.etapa === 'vendedor' ? { background: 'var(--danger-bg)' } : null}>
                  <td className="mono">{r.c.numero}</td>
                  <td>{r.c.cliente_nome}</td>
                  <td className="muted">{r.c.vendor || '—'}</td>
                  <td className="num">{brl(r.c.valor_final)}</td>
                  <td><span className={'badge ' + e.cls}>{e.txt}</span>{r.f.devolvido && r.f.etapa === 'vendedor' && <span className="badge danger" style={{ marginLeft: 6 }}>DEVOLVIDO</span>}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{r.f.devolvido && r.f.etapa === 'vendedor' ? r.f.devolucao_motivo : (r.f.correcao_agendamento ? `Medição: ${fmtDate(r.f.correcao_agendamento)}` : '—')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
