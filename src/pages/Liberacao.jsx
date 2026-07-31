import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today, addBusinessDays } from '../lib/format.js'
import Modal from '../components/Modal.jsx'
import { IcoSearch } from '../components/Icons.jsx'

const crm = supabase.schema('leblanc')

export default function Liberacao() {
  const [rows, setRows] = useState(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [pag, setPag] = useState(null) // { r, valor, data, file }
  const [saving, setSaving] = useState(false)

  const carregar = async () => {
    const fx = await crm.from('projeto_fluxo').select('*').eq('etapa', 'liberacao').order('updated_at', { ascending: true })
    if (fx.error) { setErro(fx.error.message); setRows([]); return }
    const fluxos = fx.data || []
    if (!fluxos.length) { setRows([]); return }
    const ids = fluxos.map((f) => f.contrato_id)
    const ct = await crm.from('contratos').select('id, numero, cliente_nome, vendor, valor_final, modelo_contrato').in('id', ids)
    const cmap = Object.fromEntries((ct.data || []).map((c) => [c.id, c]))
    setRows(fluxos.map((f) => ({ fluxo: f, contrato: cmap[f.contrato_id] || {} })))
  }
  useEffect(() => { carregar() }, [])

  const quem = async () => (await supabase.auth.getUser()).data?.user?.email || 'sistema'

  const liberar = async (r) => {
    const q = await quem()
    await crm.from('projeto_fluxo').update({ liberado: true, liberado_em: new Date().toISOString(), liberado_por: q, updated_at: new Date().toISOString() }).eq('contrato_id', r.fluxo.contrato_id)
    await crm.from('projeto_eventos').insert({ contrato_id: r.fluxo.contrato_id, tipo: 'liberado_industria', descricao: 'Liberado para a indústria', setor: 'Administrativo', autor: q })
    carregar()
  }

  const registrarPagamento = async () => {
    setErro('')
    const valor = Number(pag.valor)
    if (!valor || valor <= 0) { setErro('Informe o valor pago à indústria.'); return }
    setSaving(true)
    const cid = pag.r.fluxo.contrato_id
    const dataPg = pag.data || today()
    const prazo = addBusinessDays(dataPg, 35)
    const q = await quem()
    // comprovante (opcional)
    if (pag.file) {
      const safe = pag.file.name.replace(/[^\w.\-]/g, '_')
      const path = `${cid}/comprovante_industria/${Date.now()}_${safe}`
      const up = await supabase.storage.from('pasta-cliente').upload(path, pag.file, { upsert: false })
      if (!up.error) await crm.from('contrato_anexos').insert({ contrato_id: cid, tipo: 'comprovante_industria', nome_arquivo: pag.file.name, path, tamanho: pag.file.size, enviado_por: q })
    }
    await crm.from('projeto_fluxo').update({
      pago_industria: true, pago_em: dataPg, valor_pago_industria: valor,
      etapa: 'montagem', entrega_prazo: prazo, updated_at: new Date().toISOString(),
    }).eq('contrato_id', cid)
    await crm.from('projeto_eventos').insert({ contrato_id: cid, tipo: 'pago_industria', descricao: `Pago à indústria ${brl(valor)} em ${fmtDate(dataPg)} — prazo de entrega ${fmtDate(prazo)} (35 dias úteis)`, setor: 'Administrativo', autor: q })
    setSaving(false); setPag(null); carregar()
  }

  const lista = (rows || []).filter((r) => !busca || (r.contrato.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.contrato.numero || '').includes(busca))

  return (
    <>
      <div className="section-head">
        <div className="tools"><div className="search"><IcoSearch /><input className="input" placeholder="Buscar cliente / nº" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        <span className="pill">Aguardando liberação/pagamento: {(rows || []).length}</span>
      </div>
      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
      <div className="sub" style={{ marginBottom: 12 }}>Projetos corrigidos, prontos para liberar e pagar à indústria. Após o pagamento, começa o prazo de 35 dias úteis para entrega e o projeto vai para a Montagem.</div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nº</th><th>Cliente</th><th>Indústria</th><th className="num">Valor</th><th>Liberado</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan="6" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="6" className="empty">Nenhum projeto aguardando.</td></tr>}
            {lista.map((r) => (
              <tr key={r.fluxo.contrato_id}>
                <td className="mono">{r.contrato.numero}</td>
                <td>{r.contrato.cliente_nome}</td>
                <td className="muted">{r.contrato.modelo_contrato || '—'}</td>
                <td className="num">{brl(r.contrato.valor_final)}</td>
                <td>{r.fluxo.liberado ? <span className="badge ok">Liberado</span> : <span className="badge warn">Pendente</span>}</td>
                <td className="right">
                  <div className="flex" style={{ justifyContent: 'flex-end' }}>
                    {!r.fluxo.liberado && <button className="btn ghost sm" onClick={() => liberar(r)}>Liberar p/ indústria</button>}
                    <button className="btn sm" onClick={() => setPag({ r, valor: '', data: today(), file: null })}>Registrar pagamento</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pag && (
        <Modal title={`Pagamento à indústria — ${pag.r.contrato.numero}`} onClose={() => setPag(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setPag(null)}>Cancelar</button>
            <button className="btn" onClick={registrarPagamento} disabled={saving}>{saving ? 'Salvando…' : 'Confirmar pagamento'}</button>
          </>}>
          {erro && <div className="login-err" style={{ marginBottom: 12 }}>{erro}</div>}
          <div className="sub" style={{ marginBottom: 10 }}>Ao confirmar, o projeto vai para a <b>Montagem</b> e começa o prazo de <b>35 dias úteis</b> para entrega.</div>
          <div className="row-2">
            <div className="field"><label>Valor pago *</label><input className="input" type="number" step="0.01" value={pag.valor} onChange={(e) => setPag({ ...pag, valor: e.target.value })} /></div>
            <div className="field"><label>Data do pagamento</label><input className="input" type="date" value={pag.data} onChange={(e) => setPag({ ...pag, data: e.target.value })} /></div>
          </div>
          <div className="field"><label>Comprovante (opcional)</label><input className="input" type="file" onChange={(e) => setPag({ ...pag, file: e.target.files?.[0] || null })} /></div>
          <div className="sub">Prazo de entrega previsto: <b>{fmtDate(addBusinessDays(pag.data || today(), 35))}</b></div>
        </Modal>
      )}
    </>
  )
}
