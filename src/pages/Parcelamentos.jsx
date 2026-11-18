import { useEffect, useMemo, useState } from 'react'
import { supabase, authOn } from '../lib/supabase.js'
import { brl } from '../lib/format.js'
import { hojeSP } from '../lib/prazos.js'
import { CARTOES } from '../lib/cartoes.js'
import { IcoTrash } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { trazerParcelamentos } from '../lib/parcelamentosSync.js'
import { projecao, chaveParcelamento, rotuloMes, ultimoMes, parcelasRestantes, presoApos, somarMeses } from '../lib/parcelamentos.js'

// Parcelamentos nos cartões da loja: em que fatura cai cada parcela e quanto de limite sobra em
// cada mês. As compras parceladas das faturas já importadas entram com um clique.
const nomeCartao = (id) => { const c = CARTOES.find((x) => x.id === id); return c ? `${c.banco}${c.detalhe ? ' · ' + c.detalhe : ''}` : id }
const VAZIO = { cartao_id: CARTOES[0].id, descricao: '', valor: '', modo: 'parcela', parcelas_total: '', primeira_parcela: '' }

export default function Parcelamentos() {
  const mesAtual = hojeSP().slice(0, 7)
  const [parcs, setParcs] = useState(null), [limites, setLimites] = useState({}), [erro, setErro] = useState('')
  const [meses, setMeses] = useState(6), [cartaoF, setCartaoF] = useState('todos'), [verEncerrados, setVerEncerrados] = useState(false)
  const [form, setForm] = useState(null), [salvando, setSalvando] = useState(false)
  const [puxando, setPuxando] = useState(false), [aviso, setAviso] = useState('')
  const [editLimite, setEditLimite] = useState(null) // { cartao_id, valor }

  async function carregar() {
    if (!authOn) { setParcs([]); return }
    const [p, l] = await Promise.all([
      supabase.from('cartao_parcelamentos').select('*').order('primeira_parcela', { ascending: false }).limit(2000),
      supabase.from('cartao_limites').select('*'),
    ])
    if (p.error || l.error) setErro((p.error || l.error).message)
    setParcs(p.data || [])
    setLimites(Object.fromEntries((l.data || []).map((x) => [x.cartao_id, x.limite])))
  }
  useEffect(() => { carregar() }, [])

  const ativos = useMemo(() => (parcs || []).filter((p) => verEncerrados || presoApos(p, somarMeses(mesAtual, -1)) > 0), [parcs, verEncerrados, mesAtual])
  const proj = useMemo(() => projecao({ parcelamentos: parcs || [], limites, cartoes: CARTOES, inicio: mesAtual, meses }), [parcs, limites, mesAtual, meses])
  const lista = ativos.filter((p) => cartaoF === 'todos' || p.cartao_id === cartaoF)
    .sort((a, b) => a.cartao_id.localeCompare(b.cartao_id) || ultimoMes(b).localeCompare(ultimoMes(a)))

  async function puxarDasFaturas() {
    setPuxando(true); setAviso(''); setErro('')
    const { data, error } = await supabase.from('fatura_rateio').select('cartao, mes_ref, descricao, parcela, valor').neq('parcela', '').limit(5000)
    if (error) { setPuxando(false); setErro(error.message); return }
    let qtd = 0
    try { qtd = await trazerParcelamentos(data || [], mesAtual) } catch (e) { setPuxando(false); setErro(e.message); return }
    setPuxando(false)
    setAviso(qtd ? `${qtd} parcelamento(s) trazido(s) das faturas importadas. Confira e apague o que não for parcelamento.` : 'Nenhum parcelamento novo nas faturas importadas.')
    carregar()
  }

  async function salvarForm() {
    setErro('')
    const total = Number(form.parcelas_total), v = Number(String(form.valor).replace(',', '.'))
    if (!form.descricao.trim()) { setErro('Informe a descrição da compra.'); return }
    if (!(total >= 1 && total <= 120)) { setErro('Informe o número de parcelas (1 a 120).'); return }
    if (!(v > 0)) { setErro('Informe o valor.'); return }
    if (!/^\d{4}-\d{2}$/.test(form.primeira_parcela)) { setErro('Informe o mês da primeira parcela.'); return }
    const valor_parcela = Math.round((form.modo === 'total' ? v / total : v) * 100) / 100
    const reg = { cartao_id: form.cartao_id, descricao: form.descricao.trim(), valor_parcela, parcelas_total: total, primeira_parcela: form.primeira_parcela, observacao: form.observacao || null }
    setSalvando(true)
    const { data: u } = await supabase.auth.getUser()
    const q = form.id
      ? supabase.from('cartao_parcelamentos').update(reg).eq('id', form.id)
      : supabase.from('cartao_parcelamentos').insert({ ...reg, origem: 'manual', chave: chaveParcelamento(reg), criado_por: u?.user?.email || null })
    const { error } = await q
    setSalvando(false)
    if (error) { setErro(/duplicate|unique/i.test(error.message) ? 'Esse parcelamento já está cadastrado.' : error.message); return }
    setForm(null); carregar()
  }

  async function apagar(p) {
    const { error } = await supabase.from('cartao_parcelamentos').delete().eq('id', p.id)
    if (error) setErro(error.message); else carregar()
  }
  async function quitar(p) {
    const { error } = await supabase.from('cartao_parcelamentos').update({ encerrado_em: mesAtual }).eq('id', p.id)
    if (error) setErro(error.message); else carregar()
  }
  async function salvarLimite() {
    const v = editLimite.valor === '' ? null : Number(String(editLimite.valor).replace(',', '.'))
    if (v != null && !(v >= 0)) { setErro('Limite inválido.'); return }
    const { data: u } = await supabase.auth.getUser()
    const { error } = v == null
      ? await supabase.from('cartao_limites').delete().eq('cartao_id', editLimite.cartao_id)
      : await supabase.from('cartao_limites').upsert({ cartao_id: editLimite.cartao_id, limite: v, atualizado_em: new Date().toISOString(), atualizado_por: u?.user?.email || null })
    if (error) { setErro(error.message); return }
    setEditLimite(null); carregar()
  }

  const fimPrevisto = form && /^\d{4}-\d{2}$/.test(form.primeira_parcela) && Number(form.parcelas_total) >= 1 ? rotuloMes(somarMeses(form.primeira_parcela, Number(form.parcelas_total) - 1)) : '—'
  const valorParcelaPrevisto = form && Number(form.parcelas_total) >= 1 && Number(String(form.valor).replace(',', '.')) > 0
    ? (form.modo === 'total' ? Number(String(form.valor).replace(',', '.')) / Number(form.parcelas_total) : Number(String(form.valor).replace(',', '.'))) : null
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3>Parcelamentos dos cartões</h3>
          <div className="sub">Cada compra parcelada prende no limite o valor das parcelas que ainda vão cair. A cada fatura paga, uma parcela volta para o limite. O “limite livre” abaixo é o que sobra <b>depois de pagar a fatura do mês</b>, considerando só os parcelamentos: compras à vista ainda não pagas também ocupam o limite.</div>
        </div>
        {authOn && <div className="tools">
          <button className="btn ghost" type="button" onClick={puxarDasFaturas} disabled={puxando || parcs === null}>{puxando ? 'Lendo as faturas…' : 'Trazer das faturas importadas'}</button>
          <button className="btn" type="button" onClick={() => { setErro(''); setForm({ ...VAZIO, primeira_parcela: mesAtual }) }}>+ Novo parcelamento</button>
        </div>}
      </div>
      {aviso && <div className="sub" role="status" style={{ marginTop: 10, color: 'var(--ok)' }}>{aviso}</div>}
      {erro && !form && <div className="login-err" role="alert" style={{ marginTop: 10 }}>{erro}</div>}
    </div>

    <div className="table-wrap" style={{ marginBottom: 16, overflowX: 'auto' }}>
      <table>
        <thead><tr>
          <th>Cartão</th><th className="num">Limite</th><th className="num">Preso hoje</th>
          {proj[0]?.meses.map((m) => <th key={m.ym} className="num">{rotuloMes(m.ym)}</th>)}
        </tr></thead>
        <tbody>
          {proj.map((c) => <tr key={c.id}>
            <td><b>{c.banco}</b>{c.detalhe && <span className="faint"> · {c.detalhe}</span>}</td>
            <td className="num" style={{ whiteSpace: 'nowrap' }}>
              {c.limite == null ? <span className="faint">não informado</span> : brl(c.limite)}
              {authOn && <button className="btn ghost sm" style={{ marginLeft: 6 }} type="button" onClick={() => setEditLimite({ cartao_id: c.id, valor: c.limite ?? '' })}>{c.limite == null ? 'Informar' : 'Editar'}</button>}
            </td>
            <td className="num">{brl(c.presoHoje)}</td>
            {c.meses.map((m) => <td key={m.ym} className="num" style={{ whiteSpace: 'nowrap' }}>
              <div title="Soma das parcelas nesta fatura">{m.fatura ? brl(m.fatura) : <span className="faint">—</span>}</div>
              <div style={{ fontSize: 12, color: m.livre == null ? 'var(--ink-faint)' : m.livre < 0 ? 'var(--danger)' : 'var(--ok)' }} title="Limite livre depois de pagar esta fatura">
                {m.livre == null ? 'livre: —' : `livre: ${brl(m.livre)}`}
              </div>
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="tools" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      <span className="sub" style={{ margin: 0 }}>Em cada mês: em cima, quanto de parcelas cai na fatura; embaixo, o limite livre depois de pagá-la.</span>
      <select className="input" style={{ width: 170 }} value={meses} onChange={(e) => setMeses(Number(e.target.value))} aria-label="Quantos meses mostrar">
        <option value={6}>Próximos 6 meses</option><option value={12}>Próximos 12 meses</option>
      </select>
    </div>

    <div className="tools" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      <select className="input" style={{ width: 260 }} value={cartaoF} onChange={(e) => setCartaoF(e.target.value)} aria-label="Cartão">
        <option value="todos">Todos os cartões</option>{CARTOES.map((c) => <option key={c.id} value={c.id}>{nomeCartao(c.id)}</option>)}
      </select>
      <label className="sub" style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={verEncerrados} onChange={(e) => setVerEncerrados(e.target.checked)} /> Mostrar os já terminados</label>
    </div>
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table>
        <thead><tr><th>Cartão</th><th>Compra</th><th className="num">Parcela</th><th className="num">Nº</th><th>Início</th><th>Fim</th><th className="num">Faltam</th><th className="num">Saldo a pagar</th><th></th></tr></thead>
        <tbody>
          {parcs === null && <tr><td colSpan="9" className="empty">Carregando…</td></tr>}
          {parcs && !lista.length && <tr><td colSpan="9" className="empty">Nenhum parcelamento{cartaoF !== 'todos' ? ' neste cartão' : ''}. Use “Trazer das faturas importadas” ou “+ Novo parcelamento”.</td></tr>}
          {lista.map((p) => {
            const faltam = parcelasRestantes(p, mesAtual)
            return <tr key={p.id}>
              <td className="muted">{nomeCartao(p.cartao_id)}</td>
              <td>{p.descricao}{p.origem === 'fatura' && <span className="faint" style={{ fontSize: 11 }}> · da fatura</span>}{p.encerrado_em && <span className="faint" style={{ fontSize: 11 }}> · quitado em {rotuloMes(p.encerrado_em)}</span>}</td>
              <td className="num">{brl(p.valor_parcela)}</td>
              <td className="num">{p.parcelas_total}x</td>
              <td className="muted">{rotuloMes(p.primeira_parcela)}</td>
              <td className="muted">{rotuloMes(ultimoMes(p))}</td>
              <td className="num">{faltam || '—'}</td>
              <td className="num">{brl(presoApos(p, somarMeses(mesAtual, -1)))}</td>
              <td className="right" style={{ whiteSpace: 'nowrap' }}>
                <button className="btn ghost sm" type="button" onClick={() => { setErro(''); setForm({ id: p.id, cartao_id: p.cartao_id, descricao: p.descricao, valor: p.valor_parcela, modo: 'parcela', parcelas_total: p.parcelas_total, primeira_parcela: p.primeira_parcela, observacao: p.observacao || '' }) }}>Editar</button>
                {faltam > 0 && !p.encerrado_em && <button className="btn ghost sm" type="button" style={{ marginLeft: 4 }} onClick={() => quitar(p)} title="Quitado antes do fim: para de contar a partir deste mês">Quitado</button>}
                <button className="icon-btn" type="button" onClick={() => apagar(p)} title="Apagar este parcelamento" aria-label="Apagar"><IcoTrash /></button>
              </td>
            </tr>
          })}
        </tbody>
      </table>
    </div>

    {form && <Modal title={form.id ? 'Editar parcelamento' : 'Novo parcelamento'} onClose={() => setForm(null)}
      footer={<><button className="btn ghost" type="button" onClick={() => setForm(null)}>Cancelar</button><button className="btn" type="button" onClick={salvarForm} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="field"><label>Cartão</label>
        <select className="input" value={form.cartao_id} onChange={(e) => set('cartao_id', e.target.value)}>{CARTOES.map((c) => <option key={c.id} value={c.id}>{nomeCartao(c.id)}</option>)}</select></div>
      <div className="field"><label>Compra *</label><input className="input" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Ex.: Menezes — pedido do cliente X" /></div>
      <div className="grid cols-2" style={{ gap: 10 }}>
        <div className="field"><label>Valor informado</label>
          <select className="input" value={form.modo} onChange={(e) => set('modo', e.target.value)}><option value="parcela">Valor de cada parcela</option><option value="total">Valor total da compra</option></select></div>
        <div className="field"><label>{form.modo === 'total' ? 'Valor total *' : 'Valor da parcela *'}</label><input className="input" type="number" step="0.01" min="0" value={form.valor} onChange={(e) => set('valor', e.target.value)} /></div>
        <div className="field"><label>Número de parcelas *</label><input className="input" type="number" min="1" max="120" value={form.parcelas_total} onChange={(e) => set('parcelas_total', e.target.value)} /></div>
        <div className="field"><label>Fatura da 1ª parcela *</label><input className="input" type="month" value={form.primeira_parcela} onChange={(e) => set('primeira_parcela', e.target.value)} /></div>
      </div>
      <div className="sub">Termina na fatura de <b>{fimPrevisto}</b>{valorParcelaPrevisto ? <> · {form.parcelas_total}x de <b>{brl(valorParcelaPrevisto)}</b></> : null}.</div>
      <div className="field" style={{ marginTop: 10 }}><label>Observação</label><input className="input" value={form.observacao || ''} onChange={(e) => set('observacao', e.target.value)} /></div>
      {erro && <div className="login-err" role="alert">{erro}</div>}
    </Modal>}

    {editLimite && <Modal title={`Limite · ${nomeCartao(editLimite.cartao_id)}`} onClose={() => setEditLimite(null)}
      footer={<><button className="btn ghost" type="button" onClick={() => setEditLimite(null)}>Cancelar</button><button className="btn" type="button" onClick={salvarLimite}>Salvar</button></>}>
      <div className="field"><label>Limite total do cartão (R$)</label><input className="input" type="number" step="0.01" min="0" value={editLimite.valor} onChange={(e) => setEditLimite((x) => ({ ...x, valor: e.target.value }))} autoFocus /></div>
      <div className="sub">Deixe em branco para tirar o limite deste cartão.</div>
      {erro && <div className="login-err" role="alert">{erro}</div>}
    </Modal>}
  </>
}
