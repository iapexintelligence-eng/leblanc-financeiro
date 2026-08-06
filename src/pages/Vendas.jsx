import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today } from '../lib/format.js'
import { registrarLog, montarDiff } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'
import { extrairTexto, parseContrato } from '../lib/pdfLer.js'
import { ocrImagemAuto } from '../lib/ocr.js'

const CAMPOS = ['cliente_nome', 'vendedor', 'funcionario_id', 'valor_vendido', 'valor_promob', 'desconto_percentual', 'data_venda', 'observacoes']

const novo = () => ({
  cliente_nome: '', vendedor: '', funcionario_id: '',
  valor_vendido: '', valor_promob: '', desconto_percentual: '',
  data_venda: today(), observacoes: '', contrato_path: '', contrato_nome: '',
  rt_tipo: '', rt_beneficiario: '', rt_valor: '',
})

const RT_TIPOS = ['Indicação', 'Arquiteto parceiro', 'Catelli']

export default function Vendas() {
  const [rows, setRows] = useState(null)
  const [vendedores, setVendedores] = useState([])
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null) // {form, editId, original}
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [lido, setLido] = useState('')

  const aplicarLido = (p) => {
    setModal((m) => m && ({ ...m, form: { ...m.form,
      cliente_nome: m.form.cliente_nome || p.cliente || '',
      valor_vendido: m.form.valor_vendido || (p.valor ?? ''),
      data_venda: p.data || m.form.data_venda,
      vendedor: m.form.vendedor || p.vendedor || '',
    } }))
    const achou = [p.cliente && 'cliente', p.valor && 'valor', p.data && 'data', p.vendedor && 'vendedor'].filter(Boolean)
    return achou
  }

  const aoAnexar = async (file) => {
    setArquivo(file || null); setLido('')
    if (!file) return
    const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const ehImg = file.type?.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(file.name)
    if (ehPdf) {
      try {
        const achou = aplicarLido(parseContrato(await extrairTexto(file)))
        setLido(achou.length ? `Li do contrato: ${achou.join(', ')}. Confira antes de salvar.` : 'Não consegui ler os dados automaticamente — preencha à mão.')
      } catch (_) { setLido('Não consegui ler o PDF — preencha à mão.') }
    } else if (ehImg) {
      setLido('Lendo a foto do contrato…')
      try {
        const linhas = await ocrImagemAuto(file, { onProgress: (pct) => setLido(`Lendo a foto do contrato… ${pct}%`) })
        const achou = aplicarLido(parseContrato(linhas.join(' ')))
        setLido(achou.length ? `Li da foto: ${achou.join(', ')}. A leitura por foto pode errar — confira tudo antes de salvar.` : 'Não consegui ler os dados da foto — preencha à mão (a foto foi anexada).')
      } catch (_) { setLido('Não consegui ler a foto — preencha à mão (a foto foi anexada).') }
    }
  }

  const carregar = async () => {
    const [v, f] = await Promise.all([
      supabase.from('vendas').select('*').order('data_venda', { ascending: false }).limit(500),
      supabase.from('funcionarios').select('id, nome_completo, tipo, ativo').eq('ativo', true).order('nome_completo'),
    ])
    if (v.error) setErro(v.error.message)
    setRows(v.data || [])
    // Vendedores primeiro, depois demais funcionários ativos (todos podem ser selecionados).
    const fs = (f.data || [])
    fs.sort((a, b) => (b.tipo === 'Vendedor') - (a.tipo === 'Vendedor'))
    setVendedores(fs)
  }
  useEffect(() => { carregar() }, [])

  const abrirNovo = () => { setArquivo(null); setModal({ form: novo(), editId: null, original: null }) }
  const abrirEdit = (r) => { setArquivo(null); setModal({
    form: {
      cliente_nome: r.cliente_nome || '', vendedor: r.vendedor || '',
      funcionario_id: r.funcionario_id ?? '',
      valor_vendido: r.valor_vendido ?? '', valor_promob: r.valor_promob ?? '',
      desconto_percentual: r.desconto_percentual ?? '',
      data_venda: r.data_venda || today(), observacoes: r.observacoes || '',
      contrato_path: r.contrato_path || '', contrato_nome: r.contrato_nome || '',
      rt_tipo: r.rt_tipo || '', rt_beneficiario: r.rt_beneficiario || '', rt_valor: r.rt_valor ?? '',
    },
    editId: r.id, original: r,
  }) }

  const baixarContrato = async (r) => {
    if (!r.contrato_path) return
    const { data, error } = await supabase.storage.from('pasta-cliente').createSignedUrl(r.contrato_path, 60)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
    else setErro('Não foi possível abrir o contrato.')
  }
  const trocarContrato = async (r, file) => {
    if (!file) return
    setErro('')
    const safe = file.name.replace(/[^\w.\-]/g, '_')
    const path = `vendas/${r.id}/${Date.now()}_${safe}`
    const up = await supabase.storage.from('pasta-cliente').upload(path, file, { upsert: false })
    if (up.error) { setErro('Contrato não subiu: ' + up.error.message); return }
    const { error } = await supabase.from('vendas').update({ contrato_path: path, contrato_nome: file.name }).eq('id', r.id)
    if (error) { setErro(error.message); return }
    carregar()
  }
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const r2 = (x) => Math.round(x * 100) / 100
  const setPromob = (v) => setModal((m) => {
    const promob = Number(v) || 0, vend = Number(m.form.valor_vendido) || 0
    const desc = promob > 0 && vend > 0 ? String(r2((1 - vend / promob) * 100)) : m.form.desconto_percentual
    return { ...m, form: { ...m.form, valor_promob: v, desconto_percentual: desc } }
  })
  const setVendido = (v) => setModal((m) => {
    const promob = Number(m.form.valor_promob) || 0, vend = Number(v)
    const desc = promob > 0 && v !== '' && !isNaN(vend) ? String(r2((1 - vend / promob) * 100)) : m.form.desconto_percentual
    return { ...m, form: { ...m.form, valor_vendido: v, desconto_percentual: desc } }
  })
  const setDesconto = (v) => setModal((m) => {
    const promob = Number(m.form.valor_promob) || 0, d = Number(v)
    const vend = promob > 0 && v !== '' && !isNaN(d) ? String(r2(promob * (1 - d / 100))) : m.form.valor_vendido
    return { ...m, form: { ...m.form, desconto_percentual: v, valor_vendido: vend } }
  })

  // Ao escolher o vendedor no select, grava o nome (texto) e o funcionario_id juntos.
  const escolherVendedor = (id) => {
    const f = vendedores.find((x) => String(x.id) === String(id))
    setModal((m) => ({ ...m, form: { ...m.form, funcionario_id: id || '', vendedor: f ? f.nome_completo : '' } }))
  }

  const salvar = async () => {
    setErro('')
    const f = modal.form
    if (!f.cliente_nome.trim()) { setErro('Informe o nome do cliente.'); return }
    setSaving(true)
    const payload = {
      cliente_nome: f.cliente_nome.trim(),
      vendedor: f.vendedor || null,
      funcionario_id: f.funcionario_id ? Number(f.funcionario_id) : null,
      valor_vendido: f.valor_vendido === '' ? null : Number(f.valor_vendido),
      valor_promob: f.valor_promob === '' ? null : Number(f.valor_promob),
      desconto_percentual: f.desconto_percentual === '' ? null : Number(f.desconto_percentual),
      data_venda: f.data_venda || today(),
      observacoes: f.observacoes || null,
      contrato_path: f.contrato_path || null,
      contrato_nome: f.contrato_nome || null,
      rt_tipo: f.rt_tipo || null,
      rt_beneficiario: f.rt_beneficiario || null,
      rt_valor: f.rt_valor === '' ? null : Number(f.rt_valor),
    }
    let error, novoId
    if (modal.editId) {
      ({ error } = await supabase.from('vendas').update(payload).eq('id', modal.editId))
      novoId = modal.editId
      if (!error) {
        const diff = montarDiff(modal.original, payload, CAMPOS)
        await registrarLog({ tabela: 'vendas', registroId: modal.editId, acao: 'edicao', diff, descricao: `Edição da venda de ${payload.cliente_nome}` })
      }
    } else {
      const ins = await supabase.from('vendas').insert(payload).select('id').single()
      error = ins.error; novoId = ins.data?.id
      if (!error && novoId) await registrarLog({ tabela: 'vendas', registroId: novoId, acao: 'criacao', descricao: `Nova venda de ${payload.cliente_nome}` })
    }
    if (!error && arquivo && novoId) {
      setEnviando(true)
      const safe = arquivo.name.replace(/[^\w.\-]/g, '_')
      const path = `vendas/${novoId}/${Date.now()}_${safe}`
      const up = await supabase.storage.from('pasta-cliente').upload(path, arquivo, { upsert: false })
      if (!up.error) await supabase.from('vendas').update({ contrato_path: path, contrato_nome: arquivo.name }).eq('id', novoId)
      else setErro('Venda salva, mas o contrato não subiu: ' + up.error.message)
      setEnviando(false)
    }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setArquivo(null); setModal(null); carregar()
  }

  const lista = (rows || []).filter((r) =>
    !busca || (r.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) ||
    (r.vendedor || '').toLowerCase().includes(busca.toLowerCase()))

  return (
    <>
      <div className="section-head">
        <div className="tools">
          <div className="search">
            <IcoSearch />
            <input className="input" placeholder="Buscar por cliente ou vendedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <button className="btn" onClick={abrirNovo}><IcoPlus /> Nova venda</button>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Vendedor</th><th className="num">Valor vendido</th>
              <th className="num">Desc.</th><th>Data</th><th>Contrato</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan="7" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="7" className="empty">Nenhuma venda encontrada.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.cliente_nome}</td>
                <td>{r.vendedor ? <span className="badge neutral">{r.vendedor}</span> : <span className="faint">— sem vendedor —</span>}</td>
                <td className="num">{r.valor_vendido ? brl(r.valor_vendido) : '—'}</td>
                <td className="num muted">{r.desconto_percentual ? r.desconto_percentual + '%' : '—'}</td>
                <td className="muted">{fmtDate(r.data_venda)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.contrato_path && <button className="btn ghost sm" onClick={() => baixarContrato(r)}>Ver</button>}
                  <label className="btn ghost sm" style={{ marginLeft: r.contrato_path ? 4 : 0, cursor: 'pointer' }}>
                    {r.contrato_path ? 'Trocar' : 'Anexar'}
                    <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={(e) => { trocarContrato(r, e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                </td>
                <td className="right"><button className="icon-btn" onClick={() => abrirEdit(r)} title="Editar / corrigir"><IcoEdit /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.editId ? 'Editar venda' : 'Nova venda'}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </>}
        >
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field">
            <label>Cliente *</label>
            <input className="input" value={modal.form.cliente_nome} onChange={(e) => setF('cliente_nome', e.target.value)} />
          </div>
          <div className="row-2">
            <div className="field">
              <label>Vendedor</label>
              <select className="input" value={modal.form.funcionario_id || ''} onChange={(e) => escolherVendedor(e.target.value)}>
                <option value="">— selecione —</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome_completo}{v.tipo && v.tipo !== 'Vendedor' ? ` (${v.tipo})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Data do contrato (data da venda)</label>
              <input className="input" type="date" value={modal.form.data_venda} onChange={(e) => setF('data_venda', e.target.value)} />
            </div>
          </div>
          <div className="row-3">
            <div className="field"><label>Valor Promob (fábrica)</label>
              <input className="input" type="number" step="0.01" value={modal.form.valor_promob} onChange={(e) => setPromob(e.target.value)} /></div>
            <div className="field"><label>Valor vendido</label>
              <input className="input" type="number" step="0.01" value={modal.form.valor_vendido} onChange={(e) => setVendido(e.target.value)} /></div>
            <div className="field"><label>Desconto %</label>
              <input className="input" type="number" step="0.01" value={modal.form.desconto_percentual} onChange={(e) => setDesconto(e.target.value)} /></div>
          </div>
          <div className="sub" style={{ marginTop: -6 }}>Informe o Promob e o Vendido → calcula o desconto. Ou informe o desconto → calcula o vendido.</div>
          <div className="row-3">
            <div className="field"><label>RT para</label>
              <select className="input" value={modal.form.rt_tipo} onChange={(e) => setF('rt_tipo', e.target.value)}>
                <option value="">— sem RT —</option>
                {RT_TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="field"><label>Beneficiário do RT (nome)</label><input className="input" value={modal.form.rt_beneficiario} onChange={(e) => setF('rt_beneficiario', e.target.value)} placeholder="quem recebe o RT" /></div>
            <div className="field"><label>Valor do RT (R$)</label><input className="input" type="number" step="0.01" value={modal.form.rt_valor} onChange={(e) => setF('rt_valor', e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Contrato vendido (anexar PDF/imagem)</label>
            <input className="input" type="file" accept=".pdf,image/*" onChange={(e) => aoAnexar(e.target.files?.[0] || null)} />
            {modal.form.contrato_nome && !arquivo && <div className="sub" style={{ marginTop: 4 }}>Anexado: {modal.form.contrato_nome} — escolha um novo arquivo para substituir.</div>}
            {lido && <div className="badge ok" style={{ display: 'inline-block', marginTop: 6 }}>{lido}</div>}
            <div className="sub" style={{ marginTop: 4 }}>Se for um PDF de contrato Le Blanc, tento preencher cliente, valor e data automaticamente. A venda é lançada com a <b>data do contrato</b>.</div>
          </div>
          <div className="field">
            <label>Observações</label>
            <textarea className="input" value={modal.form.observacoes} onChange={(e) => setF('observacoes', e.target.value)} />
          </div>
          {vendedores.length === 0 && (
            <div className="sub" style={{ color: 'var(--warn)' }}>Nenhum funcionário ativo cadastrado ainda — cadastre em <b>Funcionários</b> para preencher a lista de vendedores.</div>
          )}
        </Modal>
      )}
    </>
  )
}
