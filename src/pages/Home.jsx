import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { supabase } from '../lib/supabase.js'
import { brl, brlShort, fmtDate, today } from '../lib/format.js'

const n = (v) => Number(v) || 0

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const rotuloMes = (ym) => { const [a, m] = ym.split('-'); return `${MESES_PT[Number(m) - 1]}/${a.slice(2)}` }
const rotuloLongo = (ym) => { const [a, m] = ym.split('-'); return `${MESES_LONGO[Number(m) - 1]} ${a}` }
const addMes = (ym, delta) => { const [a, m] = ym.split('-').map(Number); const dt = new Date(a, m - 1 + delta, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` }

export default function Home() {
  const [d, setD] = useState(null)
  const [mes, setMes] = useState(today().slice(0, 7))
  const ajustou = useRef(false)

  useEffect(() => {
    (async () => {
      const [vendas, receber, pagamentos, contas, cfg, hist] = await Promise.all([
        supabase.from('vendas').select('valor_vendido, data_venda, vendedor').limit(2000),
        supabase.from('a_receber').select('id, cliente_nome, descricao, valor_parcela, data_prevista, data_recebimento, status').limit(5000),
        supabase.from('pagamentos').select('id, descricao, fornecedor, categoria, valor, data, data_vencimento, status').limit(5000),
        supabase.from('contas_bancarias').select('saldo, ativo'),
        supabase.from('config_loja').select('chave, valor').eq('chave', 'meta_mensal').maybeSingle(),
        supabase.from('vw_historico_mensal').select('mes, faturamento').order('mes', { ascending: false }).limit(6),
      ])
      setD({
        vendas: vendas.data || [], receber: receber.data || [], pagamentos: pagamentos.data || [],
        contas: contas.data || [], meta: Number(cfg.data?.valor) || 0, hist: hist.data || [],
        erro: vendas.error?.message || receber.error?.message || pagamentos.error?.message || null,
      })
    })()
  }, [])

  // Ao carregar, se o mês atual não tiver movimento, cai pro último mês com dados.
  useEffect(() => {
    if (!d || ajustou.current) return
    const temMov = (ym) => d.vendas.some((v) => (v.data_venda || '').slice(0, 7) === ym)
      || d.pagamentos.some((p) => (p.data_vencimento || p.data || '').slice(0, 7) === ym)
    if (!temMov(mes)) {
      const meses = [...new Set(d.vendas.map((v) => (v.data_venda || '').slice(0, 7)).filter(Boolean))].sort().reverse()
      if (meses.length) setMes(meses[0])
    }
    ajustou.current = true
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps

  const k = useMemo(() => {
    if (!d) return null
    const noMes = (dt) => (dt || '').slice(0, 7) === mes
    const vendasMes = d.vendas.filter((v) => noMes(v.data_venda))
    const vendido = vendasMes.reduce((s, v) => s + (Number(v.valor_vendido) || 0), 0)
    const pct = d.meta ? vendido / d.meta : 0

    const recMes = d.receber.filter((r) => noMes(r.data_prevista))
    const recTotal = recMes.reduce((s, r) => s + (Number(r.valor_parcela) || 0), 0)
    const recRecebido = recMes.filter((r) => r.status === 'Recebido').reduce((s, r) => s + (Number(r.valor_parcela) || 0), 0)
    const recPendente = Math.max(0, recTotal - recRecebido)

    const pagMes = d.pagamentos.filter((p) => noMes(p.data_vencimento || p.data))
    const despTotal = pagMes.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const despPago = pagMes.filter((p) => p.status === 'Pago').reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const despPendente = Math.max(0, despTotal - despPago)

    const saldoMes = recRecebido - despPago

    const porV = {}
    vendasMes.forEach((v) => { const n = v.vendedor || '— sem vendedor —'; porV[n] = (porV[n] || 0) + (Number(v.valor_vendido) || 0) })
    const ranking = Object.entries(porV).sort((a, b) => b[1] - a[1])

    return { vendido, qtd: vendasMes.length, pct, recTotal, recRecebido, recPendente,
      recPct: recTotal ? recRecebido / recTotal : 0, despTotal, despPago, despPendente,
      despPct: despTotal ? despPago / despTotal : 0, saldoMes, ranking }
  }, [d, mes])

  const atraso = useMemo(() => {
    if (!d) return null
    const hoje = today()
    const pend = (s) => s !== 'Pago' && s !== 'Cancelado'
    const mapP = (p) => ({ id: p.id, quem: p.descricao || p.fornecedor || '—', venc: p.data_vencimento || p.data, valor: n(p.valor) })
    const ordena = (a, b) => (a.venc || '').localeCompare(b.venc || '')
    const pgs = d.pagamentos.filter((p) => pend(p.status) && (p.data_vencimento || p.data))
    const pagar = pgs.filter((p) => (p.data_vencimento || p.data) < hoje).map(mapP).sort(ordena)
    const aVencer = pgs.filter((p) => (p.data_vencimento || p.data) >= hoje).map(mapP).sort(ordena)
    const receber = d.receber.filter((r) => pend(r.status) && r.status !== 'Recebido' && r.data_prevista && r.data_prevista < hoje)
      .map((r) => ({ id: r.id, quem: r.cliente_nome || r.descricao || '—', venc: r.data_prevista, valor: n(r.valor_parcela) })).sort(ordena)
    return { pagar, aVencer, receber,
      totalPagar: pagar.reduce((s, x) => s + x.valor, 0),
      totalAVencer: aVencer.reduce((s, x) => s + x.valor, 0),
      totalReceber: receber.reduce((s, x) => s + x.valor, 0) }
  }, [d])

  const marcarPago = async (id) => {
    setD((s) => ({ ...s, pagamentos: s.pagamentos.map((p) => p.id === id ? { ...p, status: 'Pago', data_pagamento: today() } : p) }))
    await supabase.from('pagamentos').update({ status: 'Pago', data_pagamento: today() }).eq('id', id)
  }
  const remarcarPagar = async (id, novaData) => {
    if (!novaData) return
    setD((s) => ({ ...s, pagamentos: s.pagamentos.map((p) => p.id === id ? { ...p, data_vencimento: novaData } : p) }))
    await supabase.from('pagamentos').update({ data_vencimento: novaData }).eq('id', id)
  }
  const marcarRecebido = async (id) => {
    setD((s) => ({ ...s, receber: s.receber.map((r) => r.id === id ? { ...r, status: 'Recebido', data_recebimento: today() } : r) }))
    await supabase.from('a_receber').update({ status: 'Recebido', data_recebimento: today() }).eq('id', id)
  }
  const remarcarReceber = async (id, novaData) => {
    if (!novaData) return
    setD((s) => ({ ...s, receber: s.receber.map((r) => r.id === id ? { ...r, data_prevista: novaData } : r) }))
    await supabase.from('a_receber').update({ data_prevista: novaData }).eq('id', id)
  }

  const chart = useMemo(() => {
    if (!d) return []
    return [...d.hist].reverse().map((h) => ({ mes: rotuloMes(h.mes.slice(0, 7)), ym: h.mes.slice(0, 7), vendido: Number(h.faturamento) || 0 }))
  }, [d])

  if (!d) return <div className="spinner-wrap">Carregando painel…</div>
  if (d.erro) return <div className="login-err">Erro ao carregar dados: {d.erro}</div>

  return (
    <>
      <div className="between" style={{ marginBottom: 18 }}>
        <div className="sub" style={{ fontSize: 13 }}>Visão geral operacional</div>
        <div className="tools" style={{ alignItems: 'center' }}>
          <button className="btn ghost sm" onClick={() => setMes(addMes(mes, -1))}>◀</button>
          <span style={{ minWidth: 140, textAlign: 'center', fontWeight: 600 }}>{rotuloLongo(mes)}</span>
          <button className="btn ghost sm" onClick={() => setMes(addMes(mes, 1))}>▶</button>
        </div>
      </div>

      {atraso && atraso.aVencer.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="between">
            <h3 style={{ margin: 0 }}>A pagar em aberto (a vencer)</h3>
            <span className="sub">Total em aberto: <b>{brl(atraso.totalAVencer)}</b></span>
          </div>
          <div className="table-wrap" style={{ boxShadow: 'none', maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
            <table><tbody>
              {atraso.aVencer.map((x) => (
                <tr key={x.id}>
                  <td>{x.quem}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>venc. {fmtDate(x.venc)}</td>
                  <td className="num">{brl(x.valor)}</td>
                  <td><input className="input" type="date" defaultValue={x.venc} style={{ height: 28, padding: '2px 4px', fontSize: 12 }} onChange={(e) => remarcarPagar(x.id, e.target.value)} title="Remarcar data" /></td>
                  <td><button className="btn ghost sm" onClick={() => marcarPago(x.id)}>Pago</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}

      {atraso && (atraso.pagar.length > 0 || atraso.receber.length > 0) && (
        <div className="card" style={{ marginBottom: 20, border: '1px solid var(--danger)' }}>
          <div className="between">
            <h3 style={{ margin: 0, color: 'var(--danger)' }}>⚠ Em atraso</h3>
            <span className="sub">A pagar vencido: <b style={{ color: 'var(--danger)' }}>{brl(atraso.totalPagar)}</b>{atraso.receber.length ? <> · A receber vencido: <b>{brl(atraso.totalReceber)}</b></> : null}</span>
          </div>
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div>
              <div className="sub" style={{ marginBottom: 6 }}>Contas a pagar vencidas ({atraso.pagar.length})</div>
              <div className="table-wrap" style={{ boxShadow: 'none', maxHeight: 220, overflow: 'auto' }}>
                <table><tbody>
                  {atraso.pagar.length === 0 && <tr><td className="empty">Nada em atraso 🎉</td></tr>}
                  {atraso.pagar.map((x) => (
                    <tr key={x.id}>
                      <td>{x.quem}</td>
                      <td className="num" style={{ color: 'var(--danger)' }}>{brl(x.valor)}</td>
                      <td><input className="input" type="date" defaultValue={x.venc} style={{ height: 28, padding: '2px 4px', fontSize: 12 }} onChange={(e) => remarcarPagar(x.id, e.target.value)} title="Remarcar data" /></td>
                      <td><button className="btn ghost sm" onClick={() => marcarPago(x.id)}>Pago</button></td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
            <div>
              <div className="sub" style={{ marginBottom: 6 }}>A receber vencido ({atraso.receber.length})</div>
              <div className="table-wrap" style={{ boxShadow: 'none', maxHeight: 220, overflow: 'auto' }}>
                <table><tbody>
                  {atraso.receber.length === 0 && <tr><td className="empty">Nada em atraso</td></tr>}
                  {atraso.receber.map((x) => (
                    <tr key={x.id}>
                      <td>{x.quem}</td>
                      <td className="num" style={{ color: 'var(--warn)' }}>{brl(x.valor)}</td>
                      <td><input className="input" type="date" defaultValue={x.venc} style={{ height: 28, padding: '2px 4px', fontSize: 12 }} onChange={(e) => remarcarReceber(x.id, e.target.value)} title="Remarcar data" /></td>
                      <td><button className="btn ghost sm" onClick={() => marcarRecebido(x.id)}>Recebido</button></td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <div className="card kpi"><div className="label">Vendido</div><div className="value">{brl(k.vendido)}</div><div className="delta">{k.qtd} contrato(s) no mês</div></div>
        <div className="card kpi"><div className="label">Meta da loja</div><div className="value">{brl(d.meta)}</div><div className="delta">meta mensal</div></div>
        <div className="card kpi"><div className="label">% Realizado</div><div className="value" style={{ color: k.pct >= 1 ? 'var(--ok)' : 'inherit' }}>{(k.pct * 100).toFixed(0)}%</div><div className="delta">{(k.pct * 100).toFixed(1)}% da meta do mês</div></div>
        <div className="card kpi"><div className="label">Saldo do mês</div><div className="value" style={{ color: k.saldoMes >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{brl(k.saldoMes)}</div><div className="delta">{k.saldoMes >= 0 ? 'recebido acima do pago' : 'pago acima do recebido'}</div></div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        <PainelFinanceiro titulo="Receita" cor="var(--ok)" total={k.recTotal} feitoLabel="Recebido" feito={k.recRecebido} pendente={k.recPendente} pct={k.recPct} link="/recebiveis" />
        <PainelFinanceiro titulo="Despesa" cor="var(--danger)" total={k.despTotal} feitoLabel="Pago" feito={k.despPago} pendente={k.despPendente} pct={k.despPct} link="/pagamentos" />
        <div className="card">
          <div className="between"><h3 style={{ margin: 0 }}>Vendido x Meta</h3></div>
          <div className="sub">Últimos 6 meses</div>
          <div style={{ height: 190, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => brlShort(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
                <Tooltip formatter={(v) => brl(v)} labelStyle={{ fontWeight: 600 }} />
                {d.meta > 0 && <ReferenceLine y={d.meta} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: 'Meta', position: 'right', fontSize: 10, fill: 'var(--danger)' }} />}
                <Bar dataKey="vendido" radius={[5, 5, 0, 0]}>
                  {chart.map((c) => <Cell key={c.ym} fill={c.ym === mes ? 'var(--brand, #5b5bd6)' : '#c7c9f2'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Ranking de vendedores · {rotuloLongo(mes)}</h3>
        <div className="sub">Valor vendido no mês selecionado</div>
        {k.ranking.length === 0 ? <div className="empty">Sem vendas neste mês.</div> : (
          <div className="stack" style={{ gap: 14, marginTop: 8 }}>
            {k.ranking.map(([nome, val]) => {
              const pct = Math.round((val / (k.ranking[0][1] || 1)) * 100)
              return (
                <div key={nome}>
                  <div className="between" style={{ marginBottom: 5 }}><span>{nome}</span><span className="mono">{brl(val)}</span></div>
                  <div style={{ height: 8, background: 'var(--surface-2, var(--line))', borderRadius: 6 }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'var(--brand, #5b5bd6)', borderRadius: 6 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function PainelFinanceiro({ titulo, cor, total, feitoLabel, feito, pendente, pct, link }) {
  return (
    <div className="card">
      <div className="between"><h3 style={{ margin: 0 }}>{titulo}</h3></div>
      <div className="stack" style={{ gap: 6, marginTop: 10, fontSize: 13.5 }}>
        <div className="between"><span className="muted">Total</span><span className="mono">{brl(total)}</span></div>
        <div className="between"><span className="muted">{feitoLabel}</span><span className="mono" style={{ color: cor }}>{brl(feito)}</span></div>
        <div className="between"><span className="muted">Pendente</span><span className="mono" style={{ color: 'var(--warn)' }}>{brl(pendente)}</span></div>
        <div className="between"><span className="muted">% Realizado</span><span className="mono">{(pct * 100).toFixed(0)}%</span></div>
      </div>
      <div style={{ height: 8, background: 'var(--line)', borderRadius: 6, overflow: 'hidden', margin: '10px 0 12px' }}>
        <div style={{ width: Math.min(100, pct * 100) + '%', height: '100%', background: cor }} />
      </div>
      <Link to={link} className="btn ghost sm" style={{ width: '100%', textAlign: 'center' }}>Ver no financeiro</Link>
    </div>
  )
}
