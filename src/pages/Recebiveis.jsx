import {Link, useSearchParams} from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today, addMonths } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import Modal from '../components/Modal.jsx'
import { anexarJornada, abrirDocumento } from '../lib/jornada.js'
import { IcoPlus, IcoEdit, IcoSearch } from '../components/Icons.jsx'

const FORMAS = ['Boleto', 'PIX', 'Transferência', 'Cartão', 'Dinheiro', 'Cheque']

const FORMAS_RECEBIMENTO = ['Pix', 'Transferência', 'Boleto', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Financiamento', 'Cheque']
const aberto = (r) => r.status === 'Recebido' ? 0 : Math.max(0, (Number(r.valor_parcela) || 0) - (Number(r.valor_recebido) || 0))
const ehCartao = (f) => /cart/i.test(f || '')

const statusBadge = (r, comLancamento) => {
  if (r.status === 'Recebido') return comLancamento ? <span className="badge ok">Recebido</span> : <span className="badge ok" title="Baixa anterior, sem comprovante lançado">Recebido · sem comprovante</span>
  if (r.status === 'Parcial') return <span className="badge warn">Parcial · {brl(r.valor_recebido)}</span>
  const venc = r.data_prevista && r.data_prevista < today()
  return venc ? <span className="badge danger">Vencido</span> : <span className="badge warn">A vencer</span>
}

const novo = () => ({
  cliente_nome: '', descricao: '', valor_parcela: '', data_prevista: today(),
  forma_recebimento: 'Boleto', conta_bancaria_id: '', observacoes: '',
  parcelas: 1, intervalo: 1,
})

export default function Recebiveis() {
  const [rows, setRows] = useState(null)
  const [contas, setContas] = useState([])
  const [filtro, setFiltro] = useState('avencer') // avencer | vencidos | recebidos | todos
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [lanc, setLanc] = useState([])
  const [receber, setReceber] = useState(null)
  const [estorno, setEstorno] = useState(null)
  const [params, setParams] = useSearchParams()

  const carregar = async () => {
    const [r, c, l] = await Promise.all([
      supabase.from('a_receber').select('*').order('data_prevista', { ascending: true }).limit(2000),
      supabase.from('contas_bancarias').select('id, nome, banco').eq('ativo', true).order('nome'),
      supabase.from('recebimentos').select('*, recebimento_parcelas(a_receber_id, valor)').order('data', { ascending: false }).limit(500),
    ])
    if (r.error) setErro(r.error.message)
    else if (l.error) setErro('Recebimentos lançados: ' + l.error.message)
    setRows(r.data || [])
    setContas(c.data || [])
    setLanc(l.data || [])
    return r.data || []
  }
  useEffect(() => { carregar().then((linhas) => {
    const id = Number(params.get('lancar'))
    const p = id && linhas.find((x) => x.id === id)
    if (p) { abrirReceber(p, linhas); setParams({}, { replace: true }) }
  }) }, [])
  const comLancamento = new Set(lanc.filter((l) => !l.estornado_em).flatMap((l) => (l.recebimento_parcelas || []).map((p) => p.a_receber_id)))

  function abrirReceber(parcela, linhas = rows) {
    const abertas = (linhas || []).filter((x) => x.cliente_nome === parcela.cliente_nome && aberto(x) > 0)
    const fr = parcela.forma_recebimento || ''
    const forma = ehCartao(fr) ? (/déb|deb/i.test(fr) ? 'Cartão de débito' : 'Cartão de crédito') : (FORMAS_RECEBIMENTO.find((f) => fr.toLowerCase().startsWith(f.toLowerCase())) || 'Pix')
    const sel = forma === 'Cartão de crédito' ? abertas.filter((x) => ehCartao(x.forma_recebimento)).map((x) => x.id) : [parcela.id]
    const marcadas = sel.length ? sel : [parcela.id]
    setErro('')
    setReceber({ cliente: parcela.cliente_nome, sel: marcadas, data: today(), forma, conta_bancaria_id: parcela.conta_bancaria_id ?? '', valor: String(abertas.filter((x) => marcadas.includes(x.id)).reduce((s, x) => s + aberto(x), 0).toFixed(2)), arquivo: null, observacoes: '', salvando: false })
  }
  const abertasDoCliente = receber ? (rows || []).filter((x) => x.cliente_nome === receber.cliente && aberto(x) > 0).sort((a, b) => (a.data_prevista || '9999').localeCompare(b.data_prevista || '9999')) : []
  const somaSel = abertasDoCliente.filter((x) => receber?.sel.includes(x.id)).reduce((s, x) => s + aberto(x), 0)
  const setR = (k, v) => setReceber((m) => ({ ...m, [k]: v }))
  const alternar = (id) => setReceber((m) => {
    const sel = m.sel.includes(id) ? m.sel.filter((x) => x !== id) : [...m.sel, id]
    const soma = abertasDoCliente.filter((x) => sel.includes(x.id)).reduce((s, x) => s + aberto(x), 0)
    return { ...m, sel, valor: soma.toFixed(2) }
  })
  const escolherForma = (forma) => setReceber((m) => {
    if (forma !== 'Cartão de crédito') return { ...m, forma }
    const cart = abertasDoCliente.filter((x) => ehCartao(x.forma_recebimento)).map((x) => x.id)
    const sel = cart.length ? cart : m.sel
    return { ...m, forma, sel, valor: abertasDoCliente.filter((x) => sel.includes(x.id)).reduce((s, x) => s + aberto(x), 0).toFixed(2) }
  })

  async function lancarRecebimento() {
    setErro('')
    if (!receber.sel.length) { setErro('Marque ao menos uma parcela.'); return }
    if (!receber.arquivo) { setErro('Anexe o comprovante do pagamento do cliente.'); return }
    if (!(Number(receber.valor) > 0)) { setErro('Informe o valor recebido.'); return }
    setR('salvando', true)
    try {
      const path = await anexarJornada(receber.arquivo)
      const ordem = abertasDoCliente.filter((x) => receber.sel.includes(x.id)).map((x) => x.id)
      const { data, error } = await supabase.rpc('recebimento_lancar', {
        p_parcelas: ordem, p_data: receber.data, p_valor: Number(receber.valor), p_forma: receber.forma,
        p_conta: receber.conta_bancaria_id ? Number(receber.conta_bancaria_id) : null, p_comprovante: path, p_observacoes: receber.observacoes || null,
      })
      if (error) throw error
      await registrarLog({ tabela: 'recebimentos', registroId: data?.id, acao: 'criacao', descricao: `Recebimento de ${receber.cliente}: ${brl(receber.valor)} (${receber.forma})` })
      setReceber(null); carregar()
    } catch (e) { setErro(e.message); setR('salvando', false) }
  }
  async function estornar() {
    setErro('')
    const { error } = await supabase.rpc('recebimento_estornar', { p_id: estorno.id, p_motivo: estorno.motivo })
    if (error) { setErro(error.message); return }
    await registrarLog({ tabela: 'recebimentos', registroId: estorno.id, acao: 'edicao', descricao: `Estorno do recebimento de ${estorno.cliente_nome}: ${estorno.motivo}` })
    setEstorno(null); carregar()
  }

  const abrirNovo = () => setModal({ form: novo(), editId: null })
  const abrirEdit = (r) => setModal({
    form: {
      cliente_nome: r.cliente_nome || '', descricao: r.descricao || '',
      valor_parcela: r.valor_parcela ?? '', data_prevista: r.data_prevista || today(),
      forma_recebimento: r.forma_recebimento || 'Boleto', conta_bancaria_id: r.conta_bancaria_id ?? '',
      observacoes: r.observacoes || '', parcelas: 1, intervalo: 1, status: r.status,
    },
    editId: r.id,
  })
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const salvar = async () => {
    setErro('')
    const f = modal.form
    if (!f.cliente_nome.trim()) { setErro('Informe o cliente.'); return }
    if (f.valor_parcela === '' || Number(f.valor_parcela) <= 0) { setErro('Informe o valor.'); return }
    setSaving(true)
    const base = {
      cliente_nome: f.cliente_nome.trim(),
      descricao: f.descricao || null,
      valor_parcela: Number(f.valor_parcela),
      forma_recebimento: f.forma_recebimento || null,
      conta_bancaria_id: f.conta_bancaria_id ? Number(f.conta_bancaria_id) : null,
      observacoes: f.observacoes || null,
      status: 'Pendente',
    }
    let error
    if (modal.editId) {
      ({ error } = await supabase.from('a_receber').update({
        ...base, data_prevista: f.data_prevista, status: f.status || 'Pendente',
        ...(f.status === 'Parcial' ? { status: 'Parcial' } : {}),
      }).eq('id', modal.editId))
      if (!error) await registrarLog({ tabela: 'a_receber', registroId: modal.editId, acao: 'edicao', descricao: `Edição de recebível de ${base.cliente_nome}` })
    } else {
      const n = Math.max(1, Number(f.parcelas) || 1)
      const passo = Math.max(1, Number(f.intervalo) || 1)
      const registros = []
      for (let i = 0; i < n; i++) {
        registros.push({
          ...base,
          descricao: n > 1 ? `${base.descricao || 'Parcela'} (${i + 1}/${n})` : base.descricao,
          data_prevista: i === 0 ? f.data_prevista : addMonths(f.data_prevista, i * passo),
        })
      }
      ({ error } = await supabase.from('a_receber').insert(registros))
    }
    setSaving(false)
    if (error) { setErro(error.message); return }
    setModal(null); carregar()
  }

  const lista = (rows || []).filter((r) => {
    if (busca && !((r.cliente_nome || '').toLowerCase().includes(busca.toLowerCase()) || (r.descricao || '').toLowerCase().includes(busca.toLowerCase()))) return false
    const venc = r.data_prevista && r.data_prevista < today()
    if (filtro === 'avencer') return r.status !== 'Recebido' && !venc
    if (filtro === 'vencidos') return r.status !== 'Recebido' && venc
    if (filtro === 'recebidos') return r.status === 'Recebido'
    if (filtro === 'parciais') return r.status === 'Parcial'
    if (filtro === 'semcomprovante') return r.status === 'Recebido' && !comLancamento.has(r.id)
    return true
  })

  const totalAberto = (rows || []).reduce((s, r) => s + aberto(r), 0)
  const inicioMes = today().slice(0, 7)
  const recebidoMes = lanc.filter((l) => !l.estornado_em && (l.data || '').startsWith(inicioMes)).reduce((s, l) => s + Number(l.valor || 0), 0)

  return (
    <>
      <div className="card" style={{marginBottom:16}}><Link to="/conferencia-financeira">Conferir novos contratos, recebíveis e gratificações da jornada</Link><p className="sub">Os registros anteriores permanecem preservados abaixo.</p></div>
      <div className="section-head">
        <div className="tools">
          <select className="input" style={{ width: 170 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="avencer">A vencer</option>
            <option value="vencidos">Vencidos</option>
            <option value="parciais">Recebidos em parte</option>
            <option value="recebidos">Recebidos</option>
            <option value="semcomprovante">Recebidos sem comprovante</option>
            <option value="todos">Todos</option>
          </select>
          <div className="search">
            <IcoSearch />
            <input className="input" placeholder="Buscar cliente / descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="flex"><button className="btn ghost" onClick={abrirNovo}><IcoPlus /> Nova parcela a receber</button></div>
      </div>

      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="label">Total em aberto</div><div className="value">{brl(totalAberto)}</div></div>
        <div className="card kpi"><div className="label">Recebido no mês (com comprovante)</div><div className="value">{brl(recebidoMes)}</div></div>
        <div className="card kpi"><div className="label">Exibindo</div><div className="value">{lista.length}</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th><th>Descrição</th><th className="num">Valor</th><th className="num">Em aberto</th>
              <th>Vencimento</th><th>Forma</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan="8" className="empty">Carregando…</td></tr>}
            {rows && lista.length === 0 && <tr><td colSpan="8" className="empty">Nenhuma parcela neste filtro.</td></tr>}
            {lista.map((r) => (
              <tr key={r.id}>
                <td>{r.cliente_nome}</td>
                <td className="muted">{r.descricao || '—'}</td>
                <td className="num">{brl(r.valor_parcela)}</td>
                <td className="num">{aberto(r) ? brl(aberto(r)) : '—'}</td>
                <td className="muted">{fmtDate(r.data_prevista)}</td>
                <td className="muted">{r.forma_recebimento || '—'}</td>
                <td>{statusBadge(r, comLancamento.has(r.id))}</td>
                <td className="right">
                  <div className="flex" style={{ justifyContent: 'flex-end' }}>
                    {aberto(r) > 0 && <button className="btn sm" onClick={() => abrirReceber(r)}>Lançar recebimento</button>}
                    <button className="icon-btn" onClick={() => abrirEdit(r)} title="Editar"><IcoEdit /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.editId ? 'Editar parcela a receber' : 'Nova parcela a receber'}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </>}
        >
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field"><label>Cliente *</label>
            <input className="input" value={modal.form.cliente_nome} onChange={(e) => setF('cliente_nome', e.target.value)} /></div>
          <div className="field"><label>Descrição</label>
            <input className="input" value={modal.form.descricao} onChange={(e) => setF('descricao', e.target.value)} placeholder="Ex.: Entrada, Parcela do contrato…" /></div>
          <div className="row-2">
            <div className="field"><label>{modal.editId ? 'Valor' : 'Valor por parcela'} *</label>
              <input className="input" type="number" step="0.01" value={modal.form.valor_parcela} onChange={(e) => setF('valor_parcela', e.target.value)} /></div>
            <div className="field"><label>{modal.editId ? 'Vencimento' : '1º vencimento'}</label>
              <input className="input" type="date" value={modal.form.data_prevista} onChange={(e) => setF('data_prevista', e.target.value)} /></div>
          </div>
          {!modal.editId && (
            <div className="row-2">
              <div className="field"><label>Nº de parcelas</label>
                <input className="input" type="number" min="1" max="60" value={modal.form.parcelas} onChange={(e) => setF('parcelas', e.target.value)} /></div>
              <div className="field"><label>Intervalo (meses)</label>
                <input className="input" type="number" min="1" max="12" value={modal.form.intervalo} onChange={(e) => setF('intervalo', e.target.value)} /></div>
            </div>
          )}
          <div className="row-2">
            <div className="field"><label>Forma</label>
              <select className="input" value={modal.form.forma_recebimento} onChange={(e) => setF('forma_recebimento', e.target.value)}>
                {FORMAS.map((f) => <option key={f}>{f}</option>)}
              </select></div>
            <div className="field"><label>Conta bancária</label>
              <select className="input" value={modal.form.conta_bancaria_id || ''} onChange={(e) => setF('conta_bancaria_id', e.target.value)}>
                <option value="">— não definir —</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` · ${c.banco}` : ''}</option>)}
              </select></div>
          </div>
          {modal.editId && modal.form.status === 'Recebido' && !comLancamento.has(modal.editId) && (
            <div className="field"><label>Status</label>
              <select className="input" value={modal.form.status} onChange={(e) => setF('status', e.target.value)}>
                <option value="Recebido">Recebido (baixa antiga, sem comprovante)</option>
                <option value="Pendente">Voltar para pendente</option>
              </select></div>
          )}
          {modal.editId && <p className="sub">Para dar baixa, use “Lançar recebimento” na lista: ele pede o comprovante e atualiza o saldo do banco.</p>}
          <div className="field"><label>Observações</label>
            <textarea className="input" value={modal.form.observacoes} onChange={(e) => setF('observacoes', e.target.value)} /></div>
          {!modal.editId && Number(modal.form.parcelas) > 1 && (
            <div className="sub">Serão criados <b>{modal.form.parcelas}</b> boletos de <b>{brl(modal.form.valor_parcela || 0)}</b>, a cada <b>{modal.form.intervalo}</b> mês(es), a partir de <b>{fmtDate(modal.form.data_prevista)}</b>.</div>
          )}
        </Modal>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Recebimentos lançados</h3>
        <p className="sub">Cada lançamento tem o comprovante do cliente. Na conciliação com o extrato, confira por data, valor e conta.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th>Conta</th><th className="num">Valor</th><th>Parcelas</th><th></th></tr></thead>
          <tbody>
            {lanc.length === 0 && <tr><td colSpan="7" className="empty">Nenhum recebimento lançado ainda.</td></tr>}
            {lanc.slice(0, 100).map((l) => <tr key={l.id} style={{ opacity: l.estornado_em ? 0.55 : 1 }}>
              <td>{fmtDate(l.data)}</td>
              <td>{l.cliente_nome}{l.observacoes && <div className="sub" style={{ margin: 0 }}>{l.observacoes}</div>}</td>
              <td className="muted">{l.forma}</td>
              <td className="muted">{contas.find((c) => c.id === l.conta_bancaria_id)?.nome || '—'}</td>
              <td className="num">{brl(l.valor)}</td>
              <td className="muted">{(l.recebimento_parcelas || []).map((p) => (rows || []).find((r) => r.id === p.a_receber_id)?.descricao || `#${p.a_receber_id}`).join(' · ')}{l.estornado_em && <div><span className="badge danger">Estornado · {l.estorno_motivo}</span></div>}</td>
              <td className="right"><div className="flex" style={{ justifyContent: 'flex-end' }}>
                <button className="btn ghost sm" onClick={() => abrirDocumento(l.comprovante).catch((e) => setErro(e.message))}>Comprovante</button>
                {!l.estornado_em && <button className="btn ghost sm" onClick={() => { setErro(''); setEstorno({ ...l, motivo: '' }) }}>Estornar</button>}
              </div></td>
            </tr>)}
          </tbody>
        </table></div>
      </div>

      {receber && (
        <Modal wide title={`Lançar recebimento · ${receber.cliente}`} onClose={() => !receber.salvando && setReceber(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setReceber(null)} disabled={receber.salvando}>Cancelar</button>
            <button className="btn" onClick={lancarRecebimento} disabled={receber.salvando || !receber.sel.length || !receber.arquivo}>{receber.salvando ? 'Lançando…' : `Lançar ${brl(Number(receber.valor) || 0)}`}</button>
          </>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <div className="field"><label>Parcelas que este pagamento quita</label>
            <table><tbody>{abertasDoCliente.map((x) => <tr key={x.id}>
              <td><input type="checkbox" checked={receber.sel.includes(x.id)} onChange={() => alternar(x.id)} aria-label={`Parcela ${x.descricao || x.id}`} /></td>
              <td>{x.descricao || '—'}</td><td className="muted">{x.data_prevista ? fmtDate(x.data_prevista) : 'sem data'}</td><td className="muted">{x.forma_recebimento || '—'}</td>
              <td className="num">{brl(aberto(x))}{x.status === 'Parcial' && <div className="sub" style={{ margin: 0 }}>de {brl(x.valor_parcela)}</div>}</td>
            </tr>)}</tbody></table>
            <div className="sub">Selecionado em aberto: <b>{brl(somaSel)}</b></div>
          </div>
          <div className="row-2">
            <div className="field"><label>Forma</label>
              <select className="input" value={receber.forma} onChange={(e) => escolherForma(e.target.value)}>{FORMAS_RECEBIMENTO.map((f) => <option key={f}>{f}</option>)}</select></div>
            <div className="field"><label>Data em que o dinheiro entrou</label>
              <input className="input" type="date" max={today()} value={receber.data} onChange={(e) => setR('data', e.target.value)} /></div>
          </div>
          {receber.forma === 'Cartão de crédito' && <p className="sub">No cartão de crédito a loja recebe o valor integral de uma vez: marque todas as parcelas do cartão e lance o total num único recebimento.</p>}
          <div className="row-2">
            <div className="field"><label>Valor recebido</label>
              <input className="input" type="number" step="0.01" min="0" value={receber.valor} onChange={(e) => setR('valor', e.target.value)} />
              {Number(receber.valor) > 0 && Number(receber.valor) < somaSel - 0.005 && <small className="sub">Menor que o selecionado: a diferença fica em aberto como recebimento parcial.</small>}
              {Number(receber.valor) > somaSel + 0.005 && <small style={{ color: 'var(--danger)' }}>Maior que o saldo das parcelas marcadas.</small>}
            </div>
            <div className="field"><label>Conta em que entrou</label>
              <select className="input" value={receber.conta_bancaria_id || ''} onChange={(e) => setR('conta_bancaria_id', e.target.value)}>
                <option value="">— não informar —</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` · ${c.banco}` : ''}</option>)}
              </select></div>
          </div>
          <div className="field"><label>Comprovante do cliente (PDF ou foto) *</label>
            <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setR('arquivo', e.target.files?.[0] || null)} /></div>
          <div className="field"><label>Observações</label>
            <textarea className="input" value={receber.observacoes} onChange={(e) => setR('observacoes', e.target.value)} placeholder="Ex.: Pix do cônjuge, nº da autorização do cartão…" /></div>
        </Modal>
      )}

      {estorno && (
        <Modal title="Estornar recebimento" onClose={() => setEstorno(null)}
          footer={<><button className="btn ghost" onClick={() => setEstorno(null)}>Cancelar</button><button className="btn" onClick={estornar} disabled={(estorno.motivo || '').trim().length < 5}>Confirmar estorno</button></>}>
          {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}
          <p>{estorno.cliente_nome} · {brl(estorno.valor)} em {fmtDate(estorno.data)} ({estorno.forma}).</p>
          <p className="sub">As parcelas voltam a ficar em aberto e o valor sai do saldo da conta. O lançamento e o comprovante continuam no histórico.</p>
          <div className="field"><label>Motivo</label><textarea className="input" value={estorno.motivo} onChange={(e) => setEstorno((x) => ({ ...x, motivo: e.target.value }))} /></div>
        </Modal>
      )}
    </>
  )
}
