import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today, businessDaysUntil } from '../lib/format.js'
import Modal from '../components/Modal.jsx'
import { IcoSearch } from '../components/Icons.jsx'

const crm = supabase.schema('leblanc')
const STATUS = ['Agendada', 'Em montagem', 'Finalizada', 'Precisa assistência']

const prazoBadge = (prazo) => {
  const d = businessDaysUntil(prazo)
  if (d === null) return <span className="badge neutral">—</span>
  if (d < 0) return <span className="badge danger">Atrasada {Math.abs(d)}d úteis</span>
  if (d <= 3) return <span className="badge warn">{d}d úteis</span>
  return <span className="badge ok">{d}d úteis</span>
}

export default function Montagem() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [sel, setSel] = useState(null) // { fluxo, contrato, form, anexos }
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')

  const carregar = async () => {
    const fx = await crm.from('projeto_fluxo').select('*').eq('etapa', 'montagem').order('entrega_prazo', { ascending: true })
    if (fx.error) { setErro(fx.error.message); setRows([]); return }
    const fluxos = fx.data || []
    if (!fluxos.length) { setRows([]); return }
    const ids = fluxos.map((f) => f.contrato_id)
    const ct = await crm.from('contratos').select('id, numero, cliente_nome, cliente_endereco, valor_final').in('id', ids)
    const cmap = Object.fromEntries((ct.data || []).map((c) => [c.id, c]))
    setRows(fluxos.map((f) => ({ fluxo: f, contrato: cmap[f.contrato_id] || {} })))
  }
  useEffect(() => { carregar() }, [])

  const quem = async () => (await supabase.auth.getUser()).data?.user?.email || 'sistema'

  const carregarAnexos = async (cid) => {
    const a = await crm.from('contrato_anexos').select('*').eq('contrato_id', cid).in('tipo', ['foto_antes', 'foto_depois']).order('enviado_em', { ascending: false })
    return a.data || []
  }
  const abrir = async (r) => {
    const anexos = await carregarAnexos(r.fluxo.contrato_id)
    setSel({
      ...r, anexos,
      form: {
        dia_carregado: r.fluxo.dia_carregado || '', previsao_entrega: r.fluxo.previsao_entrega || '',
        equipe_montagem: r.fluxo.equipe_montagem || '', valor_montagem: r.fluxo.valor_montagem ?? '',
        montagem_status: r.fluxo.montagem_status || 'Agendada', cliente_avisado: !!r.fluxo.cliente_avisado_entrega,
      },
    })
  }
  const setForm = (k, v) => setSel((s) => ({ ...s, form: { ...s.form, [k]: v } }))

  const enviarFoto = async (file, tipo) => {
    if (!file || !sel) return
    setUploading(tipo)
    const cid = sel.fluxo.contrato_id
    const safe = file.name.replace(/[^\w.\-]/g, '_')
    const path = `${cid}/${tipo}/${Date.now()}_${safe}`
    const up = await supabase.storage.from('pasta-cliente').upload(path, file, { upsert: false })
    if (!up.error) await crm.from('contrato_anexos').insert({ contrato_id: cid, tipo, nome_arquivo: file.name, path, tamanho: file.size, enviado_por: await quem() })
    setUploading('')
    setSel((s) => ({ ...s, anexos: null }))
    const anexos = await carregarAnexos(cid)
    setSel((s) => ({ ...s, anexos }))
  }
  const baixar = async (a) => {
    const { data } = await supabase.storage.from('pasta-cliente').createSignedUrl(a.path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const salvar = async () => {
    setSaving(true)
    await crm.from('projeto_fluxo').update({
      dia_carregado: sel.form.dia_carregado || null, previsao_entrega: sel.form.previsao_entrega || null,
      equipe_montagem: sel.form.equipe_montagem || null, valor_montagem: sel.form.valor_montagem === '' ? null : Number(sel.form.valor_montagem),
      montagem_status: sel.form.montagem_status, cliente_avisado_entrega: sel.form.cliente_avisado, updated_at: new Date().toISOString(),
    }).eq('contrato_id', sel.fluxo.contrato_id)
    setSaving(false); setSel(null); carregar()
  }

  const finalizar = async () => {
    setErro('')
    const temAntes = (sel.anexos || []).some((a) => a.tipo === 'foto_antes')
    const temDepois = (sel.anexos || []).some((a) => a.tipo === 'foto_depois')
    if (!temAntes || !temDepois) { setErro('Anexe pelo menos uma foto ANTES e uma DEPOIS antes de finalizar.'); return }
    setSaving(true)
    const cid = sel.fluxo.contrato_id
    const q = await quem()
    await crm.from('projeto_fluxo').update({
      etapa: 'qualidade', montagem_status: 'Finalizada', data_finalizacao: today(),
      equipe_montagem: sel.form.equipe_montagem || null, valor_montagem: sel.form.valor_montagem === '' ? null : Number(sel.form.valor_montagem),
      dia_carregado: sel.form.dia_carregado || null, previsao_entrega: sel.form.previsao_entrega || null, updated_at: new Date().toISOString(),
    }).eq('contrato_id', cid)
    await crm.from('projeto_eventos').insert({ contrato_id: cid, tipo: 'montagem_finalizada', descricao: `Montagem finalizada (equipe: ${sel.form.equipe_montagem || '—'}) — enviado para Qualidade`, setor: 'Montagem', autor: q })
    setSaving(false); setSel(null); carregar()
  }

  const lista = (rows || []).filter((r) => !busca || (r.contrato.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.contrato.numero || '').includes(busca))
  const fotos = (tipo) => (sel?.anexos || []).filter((a) => a.tipo === tipo)

  return (
    <>
      <div className="section-head">
        <div className="tools"><div className="search"><IcoSearch /><input className="input" placeholder="Buscar cliente / nº" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        <span className="pill">Em montagem: {(rows || []).length}</span>
      </div>
      {erro && !sel && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nº</th><th>Cliente</th><th>Equipe</th><th>Prazo entrega</th><th>Previsão</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="7" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="7" className="empty">Nenhum projeto em montagem.</td></tr>}
            {lista.map((r) => (
              <tr key={r.fluxo.contrato_id}>
                <td className="mono">{r.contrato.numero}</td>
                <td>{r.contrato.cliente_nome}</td>
                <td className="muted">{r.fluxo.equipe_montagem || '—'}</td>
                <td>{prazoBadge(r.fluxo.entrega_prazo)}</td>
                <td className="muted">{fmtDate(r.fluxo.previsao_entrega)}</td>
                <td><span className="badge neutral">{r.fluxo.montagem_status || 'Agendada'}</span></td>
                <td className="right"><button className="btn ghost sm" onClick={() => abrir(r)}>Abrir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <Modal wide title={`Montagem — ${sel.contrato.numero} · ${sel.contrato.cliente_nome}`} onClose={() => setSel(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setSel(null)}>Fechar</button>
            <button className="btn ghost" onClick={salvar} disabled={saving}>{saving ? '…' : 'Salvar'}</button>
            <button className="btn" onClick={finalizar} disabled={saving}>Finalizar → Qualidade</button>
          </>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <div className="between" style={{ marginBottom: 12 }}>
            <span className="muted">Endereço: {sel.contrato.cliente_endereco || '—'}</span>
            {prazoBadge(sel.fluxo.entrega_prazo)}
          </div>
          <div className="row-3">
            <div className="field"><label>Dia carregado na indústria</label><input className="input" type="date" value={sel.form.dia_carregado} onChange={(e) => setForm('dia_carregado', e.target.value)} /></div>
            <div className="field"><label>Previsão de entrega</label><input className="input" type="date" value={sel.form.previsao_entrega} onChange={(e) => setForm('previsao_entrega', e.target.value)} /></div>
            <div className="field"><label>Status</label><select className="input" value={sel.form.montagem_status} onChange={(e) => setForm('montagem_status', e.target.value)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="row-2">
            <div className="field"><label>Equipe de montagem</label><input className="input" value={sel.form.equipe_montagem} onChange={(e) => setForm('equipe_montagem', e.target.value)} /></div>
            <div className="field"><label>Valor do pagamento (montagem)</label><input className="input" type="number" step="0.01" value={sel.form.valor_montagem} onChange={(e) => setForm('valor_montagem', e.target.value)} /></div>
          </div>
          <label className="flex" style={{ cursor: 'pointer', margin: '4px 0 12px' }}><input type="checkbox" checked={sel.form.cliente_avisado} onChange={(e) => setForm('cliente_avisado', e.target.checked)} /> Cliente avisado da previsão de entrega <span className="faint" style={{ fontSize: 12 }}>(aviso automático por WhatsApp entra na fase de integração)</span></label>

          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '10px 0' }}>Fotos do local (obrigatórias para finalizar)</div>
          <div className="row-2">
            <div className="field"><label>Foto ANTES</label><input className="input" type="file" accept="image/*" onChange={(e) => { enviarFoto(e.target.files?.[0], 'foto_antes'); e.target.value = '' }} />
              <div className="stack" style={{ marginTop: 6 }}>{fotos('foto_antes').map((a) => <button key={a.id} className="btn ghost sm" onClick={() => baixar(a)}>{a.nome_arquivo}</button>)}</div></div>
            <div className="field"><label>Foto DEPOIS</label><input className="input" type="file" accept="image/*" onChange={(e) => { enviarFoto(e.target.files?.[0], 'foto_depois'); e.target.value = '' }} />
              <div className="stack" style={{ marginTop: 6 }}>{fotos('foto_depois').map((a) => <button key={a.id} className="btn ghost sm" onClick={() => baixar(a)}>{a.nome_arquivo}</button>)}</div></div>
          </div>
          {uploading && <div className="sub">Enviando foto…</div>}
        </Modal>
      )}
    </>
  )
}
