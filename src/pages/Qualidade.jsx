import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { fmtDate, today } from '../lib/format.js'
import Modal from '../components/Modal.jsx'
import SignaturePad from '../components/SignaturePad.jsx'
import { IcoSearch } from '../components/Icons.jsx'

const crm = supabase.schema('leblanc')
const STATUS = ['Aprovado', 'Precisa ajuste', 'Reprovado']

export default function Qualidade() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [sel, setSel] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')
  const sig = useRef(null)

  const carregar = async () => {
    const fx = await crm.from('projeto_fluxo').select('*').eq('etapa', 'qualidade').order('data_finalizacao', { ascending: true })
    if (fx.error) { setErro(fx.error.message); setRows([]); return }
    const fluxos = fx.data || []
    if (!fluxos.length) { setRows([]); return }
    const ids = fluxos.map((f) => f.contrato_id)
    const ct = await crm.from('contratos').select('id, numero, cliente_nome').in('id', ids)
    const cmap = Object.fromEntries((ct.data || []).map((c) => [c.id, c]))
    setRows(fluxos.map((f) => ({ fluxo: f, contrato: cmap[f.contrato_id] || {} })))
  }
  useEffect(() => { carregar() }, [])

  const quem = async () => (await supabase.auth.getUser()).data?.user?.email || 'sistema'
  const carregarAnexos = async (cid) => (await crm.from('contrato_anexos').select('*').eq('contrato_id', cid).in('tipo', ['foto_qualidade', 'caderno_assinado']).order('enviado_em', { ascending: false })).data || []

  const abrir = async (r) => {
    const anexos = await carregarAnexos(r.fluxo.contrato_id)
    setSel({
      ...r, anexos,
      form: {
        qualidade_status: r.fluxo.qualidade_status || 'Aprovado', qualidade_obs: r.fluxo.qualidade_obs || '',
        teve_oat: !!r.fluxo.teve_oat, oat_descricao: r.fluxo.oat_descricao || '', cliente_assinou: !!r.fluxo.cliente_assinou,
      },
    })
  }
  const setForm = (k, v) => setSel((s) => ({ ...s, form: { ...s.form, [k]: v } }))

  const enviarArquivo = async (fileOrBlob, tipo, nome) => {
    const cid = sel.fluxo.contrato_id
    setUploading(tipo)
    const safe = (nome || 'arquivo.png').replace(/[^\w.\-]/g, '_')
    const path = `${cid}/${tipo}/${Date.now()}_${safe}`
    const up = await supabase.storage.from('pasta-cliente').upload(path, fileOrBlob, { upsert: false })
    if (!up.error) await crm.from('contrato_anexos').insert({ contrato_id: cid, tipo, nome_arquivo: nome || safe, path, tamanho: fileOrBlob.size, enviado_por: await quem() })
    setUploading('')
    const anexos = await carregarAnexos(cid)
    setSel((s) => ({ ...s, anexos }))
  }
  const baixar = async (a) => { const { data } = await supabase.storage.from('pasta-cliente').createSignedUrl(a.path, 60); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }

  const salvarAssinatura = async () => {
    if (sig.current?.isEmpty()) { setErro('Peça o cliente assinar antes de salvar.'); return }
    const blob = await sig.current.blob()
    await enviarArquivo(blob, 'caderno_assinado', `caderno_${sel.contrato.numero}.png`)
    await crm.from('projeto_fluxo').update({ cliente_assinou: true }).eq('contrato_id', sel.fluxo.contrato_id)
    setForm('cliente_assinou', true)
    sig.current.limpar()
  }

  const salvar = async () => {
    setSaving(true)
    await crm.from('projeto_fluxo').update({
      qualidade_status: sel.form.qualidade_status, qualidade_obs: sel.form.qualidade_obs || null,
      teve_oat: sel.form.teve_oat, oat_descricao: sel.form.oat_descricao || null, updated_at: new Date().toISOString(),
    }).eq('contrato_id', sel.fluxo.contrato_id)
    setSaving(false); setSel(null); carregar()
  }

  const concluir = async () => {
    setErro('')
    const assinou = sel.form.cliente_assinou || (sel.anexos || []).some((a) => a.tipo === 'caderno_assinado')
    if (!assinou) { setErro('Colha a assinatura do cliente no caderno de finalização antes de concluir.'); return }
    setSaving(true)
    const cid = sel.fluxo.contrato_id
    const q = await quem()
    await crm.from('projeto_fluxo').update({
      etapa: 'concluido', qualidade_status: sel.form.qualidade_status, qualidade_obs: sel.form.qualidade_obs || null,
      teve_oat: sel.form.teve_oat, oat_descricao: sel.form.oat_descricao || null, concluido_em: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('contrato_id', cid)
    await crm.from('projeto_eventos').insert({ contrato_id: cid, tipo: 'concluido', descricao: `Qualidade: ${sel.form.qualidade_status}${sel.form.teve_oat ? ' · com OAT' : ''} — projeto concluído`, setor: 'Qualidade', autor: q })
    setSaving(false); setSel(null); carregar()
  }

  const lista = (rows || []).filter((r) => !busca || (r.contrato.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.contrato.numero || '').includes(busca))
  const anexosTipo = (t) => (sel?.anexos || []).filter((a) => a.tipo === t)

  return (
    <>
      <div className="section-head">
        <div className="tools"><div className="search"><IcoSearch /><input className="input" placeholder="Buscar cliente / nº" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        <span className="pill">Em qualidade: {(rows || []).length}</span>
      </div>
      {erro && !sel && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nº</th><th>Cliente</th><th>Finalizada em</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="4" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="4" className="empty">Nenhum projeto em qualidade.</td></tr>}
            {lista.map((r) => (
              <tr key={r.fluxo.contrato_id}>
                <td className="mono">{r.contrato.numero}</td>
                <td>{r.contrato.cliente_nome}</td>
                <td className="muted">{fmtDate(r.fluxo.data_finalizacao)}</td>
                <td className="right"><button className="btn ghost sm" onClick={() => abrir(r)}>Abrir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <Modal wide title={`Qualidade — ${sel.contrato.numero} · ${sel.contrato.cliente_nome}`} onClose={() => setSel(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setSel(null)}>Fechar</button>
            <button className="btn ghost" onClick={salvar} disabled={saving}>Salvar</button>
            <button className="btn" onClick={concluir} disabled={saving}>Concluir projeto</button>
          </>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <div className="row-2">
            <div className="field"><label>Conferência</label><select className="input" value={sel.form.qualidade_status} onChange={(e) => setForm('qualidade_status', e.target.value)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label>Teve OAT (assistência)?</label><select className="input" value={sel.form.teve_oat ? '1' : '0'} onChange={(e) => setForm('teve_oat', e.target.value === '1')}><option value="0">Não</option><option value="1">Sim</option></select></div>
          </div>
          {sel.form.teve_oat && <div className="field"><label>Descrição da OAT</label><textarea className="input" value={sel.form.oat_descricao} onChange={(e) => setForm('oat_descricao', e.target.value)} /></div>}
          <div className="field"><label>Observações da qualidade</label><textarea className="input" value={sel.form.qualidade_obs} onChange={(e) => setForm('qualidade_obs', e.target.value)} /></div>

          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '10px 0' }}>Imagens da qualidade</div>
          <input className="input" type="file" accept="image/*" onChange={(e) => { enviarArquivo(e.target.files?.[0], 'foto_qualidade', e.target.files?.[0]?.name); e.target.value = '' }} />
          <div className="stack" style={{ marginTop: 6 }}>{anexosTipo('foto_qualidade').map((a) => <button key={a.id} className="btn ghost sm" onClick={() => baixar(a)}>{a.nome_arquivo}</button>)}</div>

          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '16px 0 8px' }}>Caderno de finalização — assinatura do cliente</div>
          {anexosTipo('caderno_assinado').length > 0 && <div className="badge ok" style={{ display: 'inline-block', marginBottom: 8 }}>✓ Já assinado</div>}
          <SignaturePad ref={sig} />
          <div className="tools" style={{ marginTop: 8 }}>
            <button className="btn ghost sm" onClick={() => sig.current?.limpar()}>Limpar</button>
            <button className="btn sm" onClick={salvarAssinatura}>Salvar assinatura</button>
            {anexosTipo('caderno_assinado').map((a) => <button key={a.id} className="btn ghost sm" onClick={() => baixar(a)}>Ver assinatura</button>)}
          </div>
          {uploading && <div className="sub" style={{ marginTop: 6 }}>Enviando…</div>}
        </Modal>
      )}
    </>
  )
}
