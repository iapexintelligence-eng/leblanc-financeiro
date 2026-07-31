import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today, businessDaysUntil } from '../lib/format.js'
import Modal from '../components/Modal.jsx'
import { IcoSearch } from '../components/Icons.jsx'

const crm = supabase.schema('leblanc')
const SITUACOES = ['Revisão', 'Implantado', 'Aguardando cliente', 'Concluído']

const prazoBadge = (prazo) => {
  const d = businessDaysUntil(prazo)
  if (d === null) return <span className="badge neutral">sem prazo</span>
  if (d < 0) return <span className="badge danger">Estourado há {Math.abs(d)} dia(s) úteis</span>
  if (d <= 2) return <span className="badge warn">{d} dia(s) úteis</span>
  return <span className="badge ok">{d} dia(s) úteis</span>
}

export default function Correcao() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [sel, setSel] = useState(null)      // { fluxo, contrato, margem[] , form }
  const [dev, setDev] = useState(null)      // { motivo }
  const [saving, setSaving] = useState(false)

  const carregar = async () => {
    const fx = await crm.from('projeto_fluxo').select('*').eq('etapa', 'correcao').order('correcao_prazo', { ascending: true })
    if (fx.error) { setErro(fx.error.message); setRows([]); return }
    const fluxos = fx.data || []
    if (!fluxos.length) { setRows([]); return }
    const ids = fluxos.map((f) => f.contrato_id)
    const ct = await crm.from('contratos').select('id, numero, cliente_nome, vendor, valor_final, dados_json').in('id', ids)
    const cmap = Object.fromEntries((ct.data || []).map((c) => [c.id, c]))
    setRows(fluxos.map((f) => ({ fluxo: f, contrato: cmap[f.contrato_id] || {} })))
  }
  useEffect(() => { carregar() }, [])

  const abrir = async (r) => {
    const m = await crm.from('correcao_margem').select('*').eq('contrato_id', r.fluxo.contrato_id).order('id')
    let margem = m.data || []
    if (!margem.length) {
      // semeia a partir dos itens do contrato (valor vendido por ambiente)
      const itens = r.contrato.dados_json?.itens || []
      margem = itens.filter((it) => it.descricao).map((it) => ({ ambiente: it.descricao, valor_vendido: Number(it.valor) || 0, valor_corrigido: '' }))
    }
    setSel({
      ...r, margem,
      form: { conferente: r.fluxo.conferente || '', situacao: r.fluxo.situacao || 'Revisão', agendamento: r.fluxo.correcao_agendamento || '' },
    })
  }
  const setForm = (k, v) => setSel((s) => ({ ...s, form: { ...s.form, [k]: v } }))
  const setMg = (i, k, v) => setSel((s) => ({ ...s, margem: s.margem.map((m, j) => j === i ? { ...m, [k]: v } : m) }))

  const quem = async () => (await supabase.auth.getUser()).data?.user?.email || 'sistema'

  const salvar = async () => {
    setSaving(true)
    const cid = sel.fluxo.contrato_id
    await crm.from('projeto_fluxo').update({
      conferente: sel.form.conferente || null, situacao: sel.form.situacao,
      correcao_agendamento: sel.form.agendamento || null, updated_at: new Date().toISOString(),
    }).eq('contrato_id', cid)
    // margem: apaga e reinsere
    await crm.from('correcao_margem').delete().eq('contrato_id', cid)
    const linhas = sel.margem.filter((m) => m.ambiente).map((m) => ({ contrato_id: cid, ambiente: m.ambiente, valor_vendido: Number(m.valor_vendido) || 0, valor_corrigido: Number(m.valor_corrigido) || 0 }))
    if (linhas.length) await crm.from('correcao_margem').insert(linhas)
    if (sel.form.agendamento && sel.form.agendamento !== sel.fluxo.correcao_agendamento) {
      await crm.from('projeto_eventos').insert({ contrato_id: cid, tipo: 'agendamento', descricao: `Medição agendada com o cliente para ${fmtDate(sel.form.agendamento)}`, setor: 'Correção', autor: await quem() })
    }
    setSaving(false); setSel(null); carregar()
  }

  const enviarLiberacao = async () => {
    setSaving(true)
    const cid = sel.fluxo.contrato_id
    const q = await quem()
    await crm.from('projeto_fluxo').update({
      etapa: 'liberacao', conferente: sel.form.conferente || null, situacao: sel.form.situacao,
      correcao_agendamento: sel.form.agendamento || null, updated_at: new Date().toISOString(),
    }).eq('contrato_id', cid)
    await crm.from('correcao_margem').delete().eq('contrato_id', cid)
    const linhas = sel.margem.filter((m) => m.ambiente).map((m) => ({ contrato_id: cid, ambiente: m.ambiente, valor_vendido: Number(m.valor_vendido) || 0, valor_corrigido: Number(m.valor_corrigido) || 0 }))
    if (linhas.length) await crm.from('correcao_margem').insert(linhas)
    await crm.from('projeto_eventos').insert({ contrato_id: cid, tipo: 'liberacao', descricao: 'Correção concluída — enviado para liberação (Léia)', setor: 'Correção', autor: q })
    setSaving(false); setSel(null); carregar()
  }

  const devolver = async () => {
    if (!dev.motivo.trim()) { setErro('Descreva o motivo da devolução.'); return }
    setSaving(true)
    const cid = sel.fluxo.contrato_id
    const q = await quem()
    await crm.from('projeto_fluxo').update({
      etapa: 'vendedor', devolvido: true, devolucao_motivo: dev.motivo.trim(),
      devolucao_em: new Date().toISOString(), devolucao_por: q, prioridade: true, updated_at: new Date().toISOString(),
    }).eq('contrato_id', cid)
    await crm.from('projeto_eventos').insert({ contrato_id: cid, tipo: 'devolucao', descricao: `Devolvido ao vendedor: ${dev.motivo.trim()} — DIRETORIA INFORMADA`, setor: 'Correção', autor: q })
    setSaving(false); setDev(null); setSel(null); carregar()
  }

  const lista = (rows || []).filter((r) => !busca || (r.contrato.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.contrato.numero || '').includes(busca))
  const estourados = (rows || []).filter((r) => (businessDaysUntil(r.fluxo.correcao_prazo) ?? 0) < 0).length

  const totVend = sel ? sel.margem.reduce((s, m) => s + (Number(m.valor_vendido) || 0), 0) : 0
  const totCorr = sel ? sel.margem.reduce((s, m) => s + (Number(m.valor_corrigido) || 0), 0) : 0

  return (
    <>
      <div className="section-head">
        <div className="tools"><div className="search"><IcoSearch /><input className="input" placeholder="Buscar cliente / nº" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        <span className="pill">Na correção: {(rows || []).length}{estourados ? ` · ${estourados} com prazo estourado` : ''}</span>
      </div>
      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nº</th><th>Cliente</th><th>Vendedor</th><th className="num">Valor</th><th>Prazo (12 dias úteis)</th><th>Agendamento</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="7" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="7" className="empty">Nenhum projeto na correção.</td></tr>}
            {lista.map((r) => (
              <tr key={r.fluxo.contrato_id}>
                <td className="mono">{r.contrato.numero}</td>
                <td>{r.contrato.cliente_nome}</td>
                <td className="muted">{r.contrato.vendor || '—'}</td>
                <td className="num">{brl(r.contrato.valor_final)}</td>
                <td>{prazoBadge(r.fluxo.correcao_prazo)}</td>
                <td className="muted">{fmtDate(r.fluxo.correcao_agendamento)}</td>
                <td className="right"><button className="btn ghost sm" onClick={() => abrir(r)}>Abrir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <Modal wide title={`Correção — ${sel.contrato.numero} · ${sel.contrato.cliente_nome}`} onClose={() => setSel(null)}
          footer={<>
            <button className="btn danger" onClick={() => setDev({ motivo: '' })}>Devolver ao vendedor</button>
            <button className="btn ghost" onClick={() => setSel(null)}>Fechar</button>
            <button className="btn ghost" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn" onClick={enviarLiberacao} disabled={saving}>Concluir → Liberação</button>
          </>}>
          <div className="between" style={{ marginBottom: 12 }}>
            <span className="muted">Vendedor: {sel.contrato.vendor || '—'}</span>
            {prazoBadge(sel.fluxo.correcao_prazo)}
          </div>
          {(businessDaysUntil(sel.fluxo.correcao_prazo) ?? 0) < 0 && (
            <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>⚠ Prazo de 12 dias úteis estourado — a diretoria é informada deste atraso.</div>
          )}
          <div className="row-3">
            <div className="field"><label>Conferente</label><input className="input" value={sel.form.conferente} onChange={(e) => setForm('conferente', e.target.value)} /></div>
            <div className="field"><label>Situação</label><select className="input" value={sel.form.situacao} onChange={(e) => setForm('situacao', e.target.value)}>{SITUACOES.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div className="field"><label>Agendamento com o cliente</label><input className="input" type="date" value={sel.form.agendamento} onChange={(e) => setForm('agendamento', e.target.value)} /></div>
          </div>

          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '16px 0 10px' }}>Controle de custo / margem (vendido × corrigido)</div>
          <div className="table-wrap" style={{ boxShadow: 'none' }}>
            <table>
              <thead><tr><th>Ambiente</th><th className="num">Vendido</th><th className="num">Corrigido</th></tr></thead>
              <tbody>
                {sel.margem.map((m, i) => (
                  <tr key={i}>
                    <td><input className="input" value={m.ambiente} onChange={(e) => setMg(i, 'ambiente', e.target.value)} /></td>
                    <td><input className="input num" type="number" step="0.01" value={m.valor_vendido} onChange={(e) => setMg(i, 'valor_vendido', e.target.value)} /></td>
                    <td><input className="input num" type="number" step="0.01" value={m.valor_corrigido} onChange={(e) => setMg(i, 'valor_corrigido', e.target.value)} /></td>
                  </tr>
                ))}
                {sel.margem.length === 0 && <tr><td colSpan="3" className="empty">Sem ambientes.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="between" style={{ marginTop: 10 }}>
            <button className="btn ghost sm" onClick={() => setSel((s) => ({ ...s, margem: [...s.margem, { ambiente: '', valor_vendido: '', valor_corrigido: '' }] }))}>+ Ambiente</button>
            <span className={totCorr > totVend + 0.5 ? 'badge danger' : 'badge ok'}>
              Vendido {brl(totVend)} · Corrigido {brl(totCorr)} · {totCorr > totVend ? `ESTOUROU ${brl(totCorr - totVend)}` : `margem ${brl(totVend - totCorr)}`}
            </span>
          </div>
        </Modal>
      )}

      {dev && (
        <Modal title="Devolver ao vendedor" onClose={() => setDev(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setDev(null)}>Cancelar</button>
            <button className="btn danger" onClick={devolver} disabled={saving}>{saving ? 'Devolvendo…' : 'Confirmar devolução'}</button>
          </>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <div className="sub" style={{ marginBottom: 10 }}>O projeto volta para o vendedor como <b>prioridade</b> e a <b>diretoria é informada</b>. Descreva o que falta/o problema (ex.: falta a lista de eletros da cozinha).</div>
          <div className="field"><label>Motivo *</label><textarea className="input" value={dev.motivo} onChange={(e) => setDev({ motivo: e.target.value })} /></div>
        </Modal>
      )}
    </>
  )
}
