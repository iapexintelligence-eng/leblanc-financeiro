import { useState } from 'react'
import { resumoAssistencias } from '../lib/assistencias.js'
import { brl } from '../lib/format.js'
import { hojeSP, somarDias } from '../lib/prazos.js'

// Onde estão os erros que geram assistência, quanto custam (com fretes) e quanto já foi cobrado de quem errou.
export default function PainelAssistencias({ registros, mapa = {}, onAbrir }) {
  const hoje = hojeSP()
  const [periodo, setPeriodo] = useState('90')
  const de = periodo === 'tudo' ? null : periodo === 'ano' ? hoje.slice(0, 4) + '-01-01' : somarDias(hoje, -Number(periodo))
  const r = resumoAssistencias(registros, { de })
  const Tabela = ({ titulo, linhas, rotulo }) => <div style={{ marginTop: 14 }}>
    <h4 style={{ margin: '0 0 6px' }}>{titulo}</h4>
    <div className="table-wrap" style={{ boxShadow: 'none' }}><table>
      <thead><tr><th>{rotulo}</th><th className="num">Assistências</th><th className="num">Em aberto</th><th className="num">Custo total</th><th className="num">Fretes</th><th className="num">A cobrar</th><th className="num">Ressarcido</th></tr></thead>
      <tbody>{linhas.length === 0 ? <tr><td colSpan="7" className="empty">Sem assistências no período.</td></tr> : linhas.map((g) => <tr key={g.chave}>
        <td>{g.chave}</td><td className="num">{g.qtd}</td><td className="num">{g.abertas}</td><td className="num">{brl(g.total)}</td><td className="num">{brl(g.frete)}</td><td className="num" style={{ color: g.aCobrar ? 'var(--warn)' : undefined }}>{brl(g.aCobrar)}</td><td className="num">{brl(g.ressarcido)}</td>
      </tr>)}</tbody>
    </table></div>
  </div>
  return <div className="card" style={{ marginBottom: 16 }}>
    <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
      <div><h3 style={{ margin: 0 }}>Assistências · onde foi o erro e quem paga</h3>
        <p className="sub" style={{ margin: '4px 0 0' }}>Cada assistência registra em que etapa aconteceu o erro, quem responde por ele, os custos (peças, mão de obra e fretes ligados) e a cobrança ao responsável.</p></div>
      <select className="input" style={{ width: 180 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">
        <option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="ano">Este ano</option><option value="tudo">Todo o período</option>
      </select>
    </div>
    <div className="grid cols-3" style={{ margin: '14px 0 4px' }}>
      <div className="card kpi"><div className="label">Assistências</div><div className="value">{r.totais.qtd}</div><div className="delta">{r.totais.semOrigem} sem origem do erro definida</div></div>
      <div className="card kpi"><div className="label">Custo total (com fretes)</div><div className="value">{brl(r.totais.total)}</div><div className="delta">fretes {brl(r.totais.frete)} · {r.totais.viagens} viagem(ns)</div></div>
      <div className="card kpi"><div className="label">Loja arcou</div><div className="value" style={{ color: r.totais.lojaArca ? 'var(--danger)' : undefined }}>{brl(r.totais.lojaArca)}</div><div className="delta">ressarcido pelos responsáveis {brl(r.totais.ressarcido)}</div></div>
    </div>
    <Tabela titulo="Por etapa onde aconteceu o erro" linhas={r.porOrigem} rotulo="Onde foi o erro" />
    <Tabela titulo="Por responsável (quem deve arcar)" linhas={r.porResponsavel} rotulo="Responsável" />
    {r.retornos.length > 0 && <div style={{ marginTop: 14 }}><h4 style={{ margin: '0 0 6px' }}>Clientes com mais de uma assistência</h4>
      {r.retornos.map((x) => <p key={x.contrato_id} style={{ margin: '4px 0' }}><b>{mapa[x.contrato_id]?.cliente_nome || x.cliente}</b> · {x.qtd} assistências · {brl(x.total)}{onAbrir && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => onAbrir(x.contrato_id)}>Ver</button>}</p>)}</div>}
  </div>
}
