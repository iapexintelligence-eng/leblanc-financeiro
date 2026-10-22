import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, authOn } from '../lib/supabase.js'
import { brl, fmtDate } from '../lib/format.js'
import { hojeSP } from '../lib/prazos.js'
import { abrirDocumento } from '../lib/jornada.js'
import { registrarLog } from '../lib/log.js'
import { dataEntregaCobranca, dataCobrancaSaldo, quitado } from '../lib/posvenda.js'
import { parcelasDoCliente, projetoDoContrato, emAberto, FORMAS_RECEBIMENTO } from '../lib/recebimentos.js'

// Campos financeiros da ficha: ficam juntos no topo, separados por momento do pagamento.
export const CAMPOS_PAGAMENTO = ['entrada_confirmada_arquivo', 'entrada_confirmada', 'cobranca_em', 'saldo_confirmado_arquivo', 'saldo_confirmado']
export const TITULOS_PAGAMENTO = ['Financeiro de entrada', 'Saldo final · 2 dias corridos antes da entrega']

function Arquivo({ k, label, d, travado, upload, anexo, onErro }) {
  return <div className="field"><label>{label}</label>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input aria-label={label} type="file" disabled={travado(k) || upload} onChange={(e) => anexo(k, e.target.files?.[0])} />
      {d[k] ? <button className="btn ghost sm" type="button" onClick={() => abrirDocumento(d[k]).catch((e) => onErro(e.message))}>Abrir anexo</button> : <span className="faint" style={{ fontSize: 12 }}>Nenhum arquivo</span>}
    </div>
  </div>
}

export default function PagamentosCliente({ registro, cliente, contratoNumero, eu, set, anexo, travado, upload, onErro }) {
  const d = registro.dados || {}
  const fin = ['financeiro', 'gestor'].includes(eu?.papel)
  const [parcelas, setParcelas] = useState(null)
  const [contas, setContas] = useState([])
  const [baixa, setBaixa] = useState(null) // { parcela, data, valor, forma, conta, origem, salvando }
  const [msg, setMsg] = useState('')

  async function carregar() {
    if (!authOn || !fin) return
    const [a, c] = await Promise.all([
      supabase.from('a_receber').select('*').limit(3000),
      supabase.from('contas_bancarias').select('id, nome').eq('ativo', true).order('nome'),
    ])
    if (a.error) { onErro?.(a.error.message); return }
    setParcelas(parcelasDoCliente(a.data, { nome: cliente, projeto: projetoDoContrato(contratoNumero) }))
    setContas(c.data || [])
  }
  useEffect(() => { carregar() }, [cliente, contratoNumero, fin]) // eslint-disable-line

  const entrega = dataEntregaCobranca(d), cobrarAte = dataCobrancaSaldo(d)
  const arquivos = [['saldo_confirmado_arquivo', 'Comprovante do saldo'], ['entrada_confirmada_arquivo', 'Comprovante da entrada']].filter(([k]) => d[k])
  const abrirBaixa = (p) => { setMsg(''); setBaixa({ parcela: p, data: hojeSP(), valor: emAberto(p).toFixed(2), forma: FORMAS_RECEBIMENTO.find((f) => (p.forma_recebimento || '').toLowerCase().startsWith(f.toLowerCase())) || 'Pix', conta: p.conta_bancaria_id ?? '', origem: arquivos[0]?.[0] || '', salvando: false }) }
  async function darBaixa() {
    const b = baixa
    if (!b.origem || !d[b.origem]) { setMsg('Anexe o comprovante acima (entrada ou saldo) e escolha qual usar.'); return }
    if (!(Number(b.valor) > 0)) { setMsg('Informe o valor recebido.'); return }
    setBaixa({ ...b, salvando: true }); setMsg('')
    const { data, error } = await supabase.rpc('recebimento_lancar', {
      p_parcelas: [b.parcela.id], p_data: b.data, p_valor: Number(b.valor), p_forma: b.forma,
      p_conta: b.conta ? Number(b.conta) : null, p_comprovante: d[b.origem], p_observacoes: `Baixa pela ficha do cliente (${b.origem === 'saldo_confirmado_arquivo' ? 'comprovante do saldo' : 'comprovante da entrada'})`,
    })
    if (error) { setBaixa({ ...b, salvando: false }); setMsg(error.message); return }
    await registrarLog({ tabela: 'recebimentos', registroId: data?.id, acao: 'criacao', descricao: `Recebimento de ${b.parcela.cliente_nome}: ${brl(b.valor)} (${b.forma}) pela ficha` })
    setBaixa(null); setMsg('Baixa lançada em Recebimentos.'); carregar()
  }

  const bloco = { border: '1px solid var(--line)', borderRadius: 10, padding: 14, background: 'var(--paper)' }
  return <div className="card" style={{ margin: '16px 0', borderColor: 'var(--ink)' }}>
    <h3 style={{ marginTop: 0 }}>Pagamentos do cliente · Leia</h3>
    <p className="sub" style={{ marginTop: 0 }}>Cada comprovante no seu lugar: a entrada (paga na assinatura) e o saldo (pago 2 dias corridos antes da entrega). Depois de anexar, clique em <b>Salvar registro</b> no fim da ficha.</p>
    <div className="grid cols-2" style={{ gap: 12 }}>
      <div style={bloco}>
        <b>1 · Entrada</b>
        <div className="sub" style={{ margin: '2px 0 10px' }}>Paga na assinatura do contrato.</div>
        <Arquivo k="entrada_confirmada_arquivo" label="Comprovante da entrada" d={d} travado={travado} upload={upload} anexo={anexo} onErro={onErro} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!d.entrada_confirmada} disabled={travado('entrada_confirmada')} onChange={(e) => set('entrada_confirmada', e.target.checked)} /> Leia: entrada conferida</label>
      </div>
      <div style={{ ...bloco, borderColor: quitado(d) ? 'var(--ok)' : 'var(--danger)' }}>
        <b>2 · Saldo final (restante)</b>
        <div className="sub" style={{ margin: '2px 0 10px', color: quitado(d) ? 'var(--ok)' : 'var(--danger)' }}>
          {quitado(d) ? 'Quitação conferida: montagem liberada.' : cobrarAte ? `🔒 Pagamento até ${fmtDate(cobrarAte)} (entrega ${fmtDate(entrega)}). A montagem só é liberada com este comprovante.` : '🔒 Sem data de entrega ainda: a Glauci lança a chegada da transportadora e a data do pagamento aparece aqui.'}
        </div>
        <div className="field"><label>Leia avisou o cliente da data do pagamento em</label><input className="input" type="date" value={d.cobranca_em || ''} disabled={travado('cobranca_em')} onChange={(e) => set('cobranca_em', e.target.value)} /></div>
        <Arquivo k="saldo_confirmado_arquivo" label="Comprovante do saldo / liquidação pela operadora" d={d} travado={travado} upload={upload} anexo={anexo} onErro={onErro} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!d.saldo_confirmado} disabled={travado('saldo_confirmado')} onChange={(e) => set('saldo_confirmado', e.target.checked)} /> Leia: quitação conferida, liberar a montagem</label>
      </div>
    </div>

    {fin && <div style={{ marginTop: 14 }}>
      <b>3 · Parcelas em Recebimentos</b>
      <div className="sub" style={{ margin: '2px 0 8px' }}>Anexar na ficha não dá baixa sozinho: use <b>Dar baixa</b> na parcela paga, com o comprovante anexado acima. Isso lança o recebimento e atualiza o saldo do banco.</div>
      {msg && <div className={/lançada/.test(msg) ? 'sub' : 'login-err'} role="status" style={{ color: /lançada/.test(msg) ? 'var(--ok)' : undefined }}>{msg}</div>}
      {parcelas === null ? <p className="faint">Carregando…</p> : parcelas.length === 0 ? <p className="faint">Nenhuma parcela deste cliente em Recebimentos. <Link to="/recebiveis">Abrir Recebimentos</Link></p> :
        <div className="table-wrap"><table><thead><tr><th>Parcela</th><th>Previsto</th><th className="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
          {parcelas.map((p) => <tr key={p.id}>
            <td>{p.descricao || 'Parcela'}<div className="sub" style={{ margin: 0 }}>{p.cliente_nome}</div></td>
            <td>{fmtDate(p.data_prevista)}</td>
            <td className="num">{brl(p.valor_parcela)}</td>
            <td>{p.status === 'Recebido' ? <span className="badge ok">Recebido</span> : p.status === 'Parcial' ? <span className="badge warn">Parcial · {brl(p.valor_recebido)}</span> : <span className={'badge ' + (p.data_prevista < hojeSP() ? 'danger' : 'warn')}>Em aberto</span>}</td>
            <td className="right">{emAberto(p) > 0 && <button className="btn sm" type="button" onClick={() => abrirBaixa(p)}>Dar baixa</button>}</td>
          </tr>)}
        </tbody></table></div>}
      {baixa && <div style={{ ...bloco, marginTop: 10 }}>
        <b>Dar baixa · {baixa.parcela.descricao || 'parcela'} ({brl(emAberto(baixa.parcela))} em aberto)</b>
        <div className="grid cols-2" style={{ gap: 10, marginTop: 8 }}>
          <div className="field"><label>Comprovante</label><select className="input" value={baixa.origem} onChange={(e) => setBaixa({ ...baixa, origem: e.target.value })}><option value="">Escolha…</option>{arquivos.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{!arquivos.length && <div className="sub">Anexe o comprovante na entrada ou no saldo acima.</div>}</div>
          <div className="field"><label>Data do recebimento</label><input className="input" type="date" max={hojeSP()} value={baixa.data} onChange={(e) => setBaixa({ ...baixa, data: e.target.value })} /></div>
          <div className="field"><label>Valor recebido</label><input className="input" type="number" step="0.01" value={baixa.valor} onChange={(e) => setBaixa({ ...baixa, valor: e.target.value })} /></div>
          <div className="field"><label>Forma</label><select className="input" value={baixa.forma} onChange={(e) => setBaixa({ ...baixa, forma: e.target.value })}>{FORMAS_RECEBIMENTO.map((f) => <option key={f}>{f}</option>)}</select></div>
          <div className="field"><label>Conta que recebeu</label><select className="input" value={baixa.conta} onChange={(e) => setBaixa({ ...baixa, conta: e.target.value })}><option value="">— não definir —</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost" type="button" onClick={() => setBaixa(null)} disabled={baixa.salvando}>Cancelar</button><button className="btn" type="button" onClick={darBaixa} disabled={baixa.salvando}>{baixa.salvando ? 'Lançando…' : 'Confirmar baixa'}</button></div>
      </div>}
    </div>}
  </div>
}
