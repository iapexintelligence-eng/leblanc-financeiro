import { useState } from 'react'
import { brl, fmtDate, today, addMonths } from '../lib/format.js'
import { CARTAO, simularCartao, simularFinanceira, round2 } from '../lib/taxas.js'
import { IcoPlus } from '../components/Icons.jsx'

const FORMAS = ['Pix / À vista', 'Débito', 'Crédito (cartão)', 'Financeira Santander']
const BANDEIRAS = Object.keys(CARTAO)

const linhaVazia = (valor = '') => ({ forma: 'Pix / À vista', valor, bandeira: 'Visa / Master / Elo', tipo: 'Crédito', parcelas: 1, carencia: 30, prazoFin: 12, primeira: today() })

function calcLinha(l) {
  const valor = Number(l.valor) || 0
  if (l.forma === 'Pix / À vista') return { valorCliente: valor, parcela: valor, n: 1, lojaRecebe: valor, taxa: 0 }
  if (l.forma === 'Débito') { const r = simularCartao(valor, l.bandeira, 'Débito', 1); return { ...r, taxa: r.taxaCliente } }
  if (l.forma === 'Crédito (cartão)') { const r = simularCartao(valor, l.bandeira, 'Crédito', Number(l.parcelas) || 1); return { ...r, taxa: r.taxaCliente } }
  if (l.forma === 'Financeira Santander') { const r = simularFinanceira(valor, Number(l.carencia), Number(l.prazoFin)); return r ? { ...r, taxa: r.retencao } : { valorCliente: 0, parcela: 0, n: 0, lojaRecebe: 0, taxa: 0 } }
  return { valorCliente: valor, parcela: valor, n: 1, lojaRecebe: valor, taxa: 0 }
}

export default function Simulador() {
  const [promob, setPromob] = useState('')
  const [descTipo, setDescTipo] = useState('%')
  const [descVal, setDescVal] = useState('')
  const [rt, setRt] = useState('')
  const [extras, setExtras] = useState('')
  const [linhas, setLinhas] = useState([linhaVazia()])

  const base = Number(promob) || 0
  const descontoV = descTipo === '%' ? base * (Number(descVal) || 0) / 100 : (Number(descVal) || 0)
  const aposDesc = Math.max(0, base - descontoV)
  const rtV = aposDesc * (Number(rt) || 0) / 100
  const extrasV = Number(extras) || 0
  const valorFinal = round2(aposDesc + rtV + extrasV)

  const set = (i, k, v) => setLinhas((s) => s.map((l, j) => j === i ? { ...l, [k]: v } : l))
  const add = () => setLinhas((s) => [...s, linhaVazia()])
  const rm = (i) => setLinhas((s) => s.filter((_, j) => j !== i))
  const avista6040 = () => setLinhas([{ ...linhaVazia(round2(valorFinal * 0.6)) }, { ...linhaVazia(round2(valorFinal * 0.4)) }])
  const usarTotal = () => setLinhas([linhaVazia(valorFinal)])

  const alocado = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const restante = valorFinal - alocado
  const calc = linhas.map(calcLinha)
  const totalCliente = calc.reduce((s, r) => s + (r.valorCliente || 0), 0)
  const totalLoja = calc.reduce((s, r) => s + (r.lojaRecebe || 0), 0)

  return (
    <div className="card" style={{ maxWidth: 940 }}>
      <h3>Simulador de pagamento</h3>
      <div className="sub">Do valor do Promob ao pagamento: aplica desconto, RT e itens extras, e monta a forma (pode misturar). Mostra o que o cliente paga e o que a loja recebe líquido.</div>

      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '14px 0 10px' }}>Composição do valor</div>
      <div className="row-2">
        <div className="field"><label>Valor Promob (base de fábrica)</label><input className="input" type="number" step="0.01" value={promob} onChange={(e) => setPromob(e.target.value)} /></div>
        <div className="field"><label>Desconto ao cliente</label>
          <div className="flex">
            <select className="input" style={{ width: 78 }} value={descTipo} onChange={(e) => setDescTipo(e.target.value)}><option value="%">%</option><option value="R$">R$</option></select>
            <input className="input" type="number" step="0.01" value={descVal} onChange={(e) => setDescVal(e.target.value)} />
          </div></div>
      </div>
      <div className="row-2">
        <div className="field"><label>RT de projetos (%)</label><input className="input" type="number" step="0.01" value={rt} onChange={(e) => setRt(e.target.value)} placeholder="ex.: 5" /></div>
        <div className="field"><label>Itens extras (R$)</label><input className="input" type="number" step="0.01" value={extras} onChange={(e) => setExtras(e.target.value)} /></div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
        <div className="between" style={{ fontSize: 13 }}><span className="muted">Promob (base)</span><span className="mono">{brl(base)}</span></div>
        <div className="between" style={{ fontSize: 13 }}><span className="muted">− Desconto</span><span className="mono" style={{ color: 'var(--danger)' }}>− {brl(descontoV)}</span></div>
        <div className="between" style={{ fontSize: 13 }}><span className="muted">+ RT ({Number(rt) || 0}%)</span><span className="mono" style={{ color: 'var(--ok)' }}>+ {brl(rtV)}</span></div>
        <div className="between" style={{ fontSize: 13 }}><span className="muted">+ Itens extras</span><span className="mono" style={{ color: 'var(--ok)' }}>+ {brl(extrasV)}</span></div>
        <div className="between" style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line)' }}><b>Valor final</b><b style={{ fontFamily: 'var(--serif)', fontSize: 20 }}>{brl(valorFinal)}</b></div>
      </div>
      <div className="tools" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={usarTotal}>Usar o total numa forma só</button>
        <button className="btn ghost sm" onClick={avista6040}>À vista 60% + 40%</button>
      </div>

      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '6px 0 10px' }}>Formas de pagamento</div>
      {linhas.map((l, i) => {
        const r = calc[i]
        return (
          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div className="row-2">
              <div className="field" style={{ margin: 0 }}><label>Forma</label>
                <select className="input" value={l.forma} onChange={(e) => set(i, 'forma', e.target.value)}>{FORMAS.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="field" style={{ margin: 0 }}><label>Valor nesta forma</label><input className="input" type="number" step="0.01" value={l.valor} onChange={(e) => set(i, 'valor', e.target.value)} /></div>
            </div>
            {l.forma === 'Crédito (cartão)' && (
              <div className="row-3" style={{ marginTop: 10 }}>
                <div className="field" style={{ margin: 0 }}><label>Bandeira</label><select className="input" value={l.bandeira} onChange={(e) => set(i, 'bandeira', e.target.value)}>{BANDEIRAS.map((b) => <option key={b}>{b}</option>)}</select></div>
                <div className="field" style={{ margin: 0 }}><label>Parcelas</label><input className="input" type="number" min="1" max="21" value={l.parcelas} onChange={(e) => set(i, 'parcelas', e.target.value)} /></div>
                <div className="field" style={{ margin: 0 }}><label>1ª parcela</label><input className="input" type="date" value={l.primeira} onChange={(e) => set(i, 'primeira', e.target.value)} /></div>
              </div>
            )}
            {l.forma === 'Débito' && (
              <div className="field" style={{ marginTop: 10 }}><label>Bandeira</label><select className="input" value={l.bandeira} onChange={(e) => set(i, 'bandeira', e.target.value)}>{BANDEIRAS.filter((b) => CARTAO[b].debito != null).map((b) => <option key={b}>{b}</option>)}</select></div>
            )}
            {l.forma === 'Financeira Santander' && (
              <div className="row-3" style={{ marginTop: 10 }}>
                <div className="field" style={{ margin: 0 }}><label>Carência</label><select className="input" value={l.carencia} onChange={(e) => set(i, 'carencia', e.target.value)}><option value={30}>30 dias</option><option value={60}>60 dias</option></select></div>
                <div className="field" style={{ margin: 0 }}><label>Prazo</label><input className="input" type="number" min="1" max="24" value={l.prazoFin} onChange={(e) => set(i, 'prazoFin', e.target.value)} /></div>
                <div className="field" style={{ margin: 0 }}><label>1ª parcela</label><input className="input" type="date" value={l.primeira} onChange={(e) => set(i, 'primeira', e.target.value)} /></div>
              </div>
            )}
            <div className="between" style={{ marginTop: 10, fontSize: 13 }}>
              <span className="muted">{r.n > 1 ? `${r.n}x de ${brl(r.parcela)}` : `1x de ${brl(r.parcela)}`}{r.taxa ? ` · taxa ${r.taxa}%` : ' · sem taxa'}</span>
              <span>Cliente: <b>{brl(r.valorCliente)}</b> · Loja: <b>{brl(r.lojaRecebe)}</b> {linhas.length > 1 && <button className="icon-btn" style={{ marginLeft: 8 }} onClick={() => rm(i)}>×</button>}</span>
            </div>
          </div>
        )
      })}
      <button className="btn ghost sm" onClick={add}><IcoPlus /> Adicionar forma (pagamento misto)</button>

      <div className="grid cols-3" style={{ marginTop: 18 }}>
        <div className="card kpi"><div className="label">Cliente paga (total)</div><div className="value">{brl(totalCliente)}</div></div>
        <div className="card kpi"><div className="label">Loja recebe líquido</div><div className="value">{brl(totalLoja)}</div><div className="delta">custo taxas: {brl(totalCliente - totalLoja)}</div></div>
        <div className="card kpi"><div className="label">A alocar</div><div className="value" style={{ color: Math.abs(restante) > 0.5 ? 'var(--danger)' : 'var(--ok)' }}>{brl(restante)}</div><div className="delta">{Math.abs(restante) > 0.5 ? 'ajuste os valores' : 'bate com o valor final'}</div></div>
      </div>
    </div>
  )
}
