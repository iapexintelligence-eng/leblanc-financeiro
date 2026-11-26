import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import { sugerirParcelas } from '../lib/parcelasContrato.js'
import { parcelasDoCliente, projetoDeContrato, FORMAS_RECEBIMENTO } from '../lib/recebimentos.js'
import Modal from './Modal.jsx'

// Lança em Entradas (a_receber) o que o cliente vai pagar, a partir da forma de pagamento do contrato.
// Sem isso, contrato subido à mão não aparece em Entradas e não dá para dar baixa no que ele pagou.
export default function ParcelasContrato({ contratoId, onClose, onFeito }) {
  const [c, setC] = useState(null), [ja, setJa] = useState([]), [linhas, setLinhas] = useState([])
  const [erro, setErro] = useState(''), [salvando, setSalvando] = useState(false)

  useEffect(() => { (async () => {
    const { data, error } = await supabase.schema('leblanc').from('contratos')
      .select('id,numero,cliente_nome,valor_final,venda_id:dados_json->>venda_id,data_contrato:dados_json->>data_contrato,forma:dados_json->>forma_pagamento_contrato,condicao:dados_json->>condicao_pagamento,forma_pagamento,created_at').eq('id', contratoId).single()
    if (error) { setErro(error.message); return }
    data.forma = data.forma || data.condicao || data.forma_pagamento || ''
    const projeto = projetoDeContrato(data)
    const { data: ar } = await supabase.from('a_receber').select('*').limit(5000)
    setJa(parcelasDoCliente(ar || [], { nome: data.cliente_nome, projeto }))
    setC(data)
    const existentes = parcelasDoCliente(ar || [], { nome: data.cliente_nome, projeto })
    const lancado = existentes.reduce((t, r) => t + Number(r.valor_parcela || 0), 0)
    const falta = Math.round((Number(data.valor_final || 0) - lancado) * 100) / 100
    // Já tem parcelas: sugere só o que falta lançar do contrato.
    setLinhas(existentes.length
      ? (falta > 0 ? [{ descricao: 'Saldo do contrato ainda não lançado', valor: falta, data_prevista: '', forma: 'Pix' }] : [])
      : sugerirParcelas(data.forma, data.valor_final, data.data_contrato || String(data.created_at || '').slice(0, 10)).linhas)
  })() }, [contratoId])

  const soma = useMemo(() => Math.round(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0) * 100) / 100, [linhas])
  const total = Number(c?.valor_final) || 0
  const set = (i, k, v) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  async function lancar() {
    setErro('')
    const ok = linhas.filter((l) => Number(l.valor) > 0)
    if (!ok.length) { setErro('Informe ao menos uma parcela com valor.'); return }
    setSalvando(true)
    const projeto = projetoDeContrato(c)
    const regs = ok.map((l) => ({
      cliente_nome: c.cliente_nome, projeto_uid: projeto, descricao: `Contrato ${c.numero} — ${l.descricao || 'Parcela'}`,
      valor_parcela: Number(l.valor), data_prevista: l.data_prevista || null, forma_recebimento: l.forma || null,
      status: 'Pendente', observacoes: 'Lançada a partir do contrato subido em Clientes → Contratos',
    }))
    const { error } = await supabase.from('a_receber').insert(regs)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    await registrarLog({ tabela: 'a_receber', registroId: c.id, acao: 'criacao', descricao: `${regs.length} parcela(s) a receber de ${c.cliente_nome} lançadas pelo contrato ${c.numero} (${brl(soma)})` })
    onFeito?.(regs.length)
  }

  const footer = c && <>
    <span className="sub" style={{ marginRight: 'auto' }}>Soma {brl(soma)}{total > 0 && Math.abs(total - soma) >= 0.01 ? <b style={{ color: 'var(--danger)' }}> · diferença de {brl(total - soma)} para o contrato</b> : total > 0 ? ' · bate com o contrato' : ''}</span>
    <button className="btn ghost" type="button" onClick={onClose}>Agora não</button>
    <button className="btn" type="button" disabled={salvando} onClick={lancar}>{salvando ? 'Lançando…' : 'Lançar em Entradas'}</button>
  </>

  return <Modal wide title={c ? `O que ${c.cliente_nome} vai pagar` : 'Parcelas do contrato'} onClose={onClose} footer={footer}>
    {!c && !erro && <div className="sub">Carregando…</div>}
    {c && <>
      <p className="sub" style={{ marginTop: 0 }}>Contrato {c.numero}{total > 0 ? ` · ${brl(total)}` : ''}{c.data_contrato ? ` · ${fmtDate(c.data_contrato)}` : ''}. Montei as parcelas pela forma de pagamento do contrato: confira valores e datas, e deixe a data em branco quando ela depender da obra (ex.: na montagem). Depois de lançar, o cliente aparece em <Link to="/recebiveis">Entradas → Recebimentos</Link> para dar baixa.</p>
      {c.forma && <div className="sub" style={{ background: 'var(--paper)', padding: '8px 10px', borderRadius: 8 }}><b>No contrato:</b> {c.forma}</div>}
      {ja.length > 0 && <div className="sub" style={{ color: 'var(--danger)', marginTop: 8 }}>Este cliente já tem {ja.length} parcela(s) em Entradas ({brl(ja.reduce((s, r) => s + Number(r.valor_parcela || 0), 0))}). Lance só o que estiver faltando, para não cobrar duas vezes.</div>}
      <div className="table-wrap" style={{ marginTop: 10, maxHeight: 380, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Descrição</th><th className="num">Valor</th><th>Data prevista</th><th>Forma</th><th></th></tr></thead>
          <tbody>{linhas.map((l, i) => <tr key={i}>
            <td><input className="input" value={l.descricao} onChange={(e) => set(i, 'descricao', e.target.value)} aria-label="Descrição" /></td>
            <td style={{ width: 130 }}><input className="input" type="number" step="0.01" min="0" value={l.valor} onChange={(e) => set(i, 'valor', e.target.value)} aria-label="Valor" /></td>
            <td style={{ width: 150 }}><input className="input" type="date" value={l.data_prevista || ''} onChange={(e) => set(i, 'data_prevista', e.target.value)} aria-label="Data prevista" /></td>
            <td style={{ width: 150 }}><select className="input" value={l.forma || 'Pix'} onChange={(e) => set(i, 'forma', e.target.value)} aria-label="Forma">{FORMAS_RECEBIMENTO.map((f) => <option key={f}>{f}</option>)}</select></td>
            <td><button className="btn ghost sm" type="button" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} aria-label="Tirar parcela">×</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <button className="btn ghost sm" type="button" style={{ marginTop: 8 }} onClick={() => setLinhas((ls) => [...ls, { descricao: 'Parcela', valor: '', data_prevista: '', forma: 'Pix' }])}>+ Adicionar parcela</button>
    </>}
    {erro && <div className="login-err" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
  </Modal>
}
