import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today, addMonths } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import { IcoPlus } from '../components/Icons.jsx'
import ContratoPDF from '../components/ContratoPDF.jsx'

// Cliente CRM (schema leblanc) — mesmo projeto Supabase, schema diferente.
const crm = supabase.schema('leblanc')

const FORMAS = [
  { v: 'À vista', desc: 'Pagamento único ou entrada + saldo' },
  { v: 'Parcelado (loja)', desc: 'Parcelas direto com a loja' },
  { v: 'Cartão de crédito', desc: 'Parcelas no cartão (com juros da maquininha)' },
  { v: 'Financeira', desc: 'Parcelado via instituição financeira' },
]

const vazio = () => ({
  cliente_nome: '', cliente_cpf: '', cliente_telefone: '', cliente_endereco: '',
  projeto_ambientes: '', vendor: '', modelo_contrato: 'Le Blanc',
  valor_tabela: '', desconto_tipo: '%', desconto_entrada: '',
  forma_pagamento: 'À vista', parcelas: 1, primeira_parcela: today(),
  intervalo: 30, taxa_juros: 0, observacoes: '',
})

export default function NovoContrato() {
  const [f, setF] = useState(vazio())
  const [vendedores, setVendedores] = useState([])
  const [modelos, setModelos] = useState([])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(null) // {contrato, parcelas}

  useEffect(() => {
    (async () => {
      const fu = await supabase.from('funcionarios').select('id, nome_completo, tipo, ativo').eq('ativo', true).order('nome_completo')
      const fs = (fu.data || []); fs.sort((a, b) => (b.tipo === 'Vendedor') - (a.tipo === 'Vendedor'))
      setVendedores(fs)
      const m = await crm.from('contrato_modelos').select('id, nome, slug, ativo').eq('ativo', true).order('nome')
      if (!m.error && m.data?.length) setModelos(m.data)
    })()
  }, [])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  // ---- Cálculos ----
  const valorTabela = Number(f.valor_tabela) || 0
  const descVal = f.desconto_tipo === '%'
    ? valorTabela * (Number(f.desconto_entrada) || 0) / 100
    : (Number(f.desconto_entrada) || 0)
  const valorBase = Math.max(0, valorTabela - descVal)
  const nParc = Math.max(1, Number(f.parcelas) || 1)
  const juros = Number(f.taxa_juros) || 0 // % ao mês (cartão/financeira)
  // Valor final: à vista/loja = valorBase; cartão/financeira aplica juros compostos simples sobre o total.
  const comJuros = (f.forma_pagamento === 'Cartão de crédito' || f.forma_pagamento === 'Financeira') && juros > 0
    ? valorBase * Math.pow(1 + juros / 100, nParc) : valorBase
  const valorFinal = comJuros
  const valorParcela = valorFinal / nParc

  const simulacao = Array.from({ length: nParc }, (_, i) => ({
    numero: i + 1,
    valor: valorParcela,
    vencimento: f.forma_pagamento === 'À vista' && nParc === 1
      ? f.primeira_parcela
      : addMonths(f.primeira_parcela, Math.round((i * (Number(f.intervalo) || 30)) / 30)),
  }))

  const gerarNumero = () => {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours())}${String(d.getMinutes())}${String(d.getSeconds())}`
  }

  const salvar = async () => {
    setErro('')
    if (!f.cliente_nome.trim()) { setErro('Informe o nome do cliente.'); return }
    if (valorTabela <= 0) { setErro('Informe o valor de tabela.'); return }
    setSaving(true)
    const numero = gerarNumero()
    // 1) Cria o contrato no schema leblanc (CRM)
    const insC = await crm.from('contratos').insert({
      numero,
      cliente_nome: f.cliente_nome.trim(), cliente_cpf: f.cliente_cpf || null,
      cliente_telefone: f.cliente_telefone || null, cliente_endereco: f.cliente_endereco || null,
      projeto_ambientes: f.projeto_ambientes || null, vendor: f.vendor || null,
      modelo_contrato: f.modelo_contrato, valor_tabela: valorTabela,
      desconto_tipo: f.desconto_tipo, desconto_entrada: Number(f.desconto_entrada) || 0,
      valor_desconto: descVal, valor_final: valorFinal,
      forma_pagamento: f.forma_pagamento, parcelas: nParc,
      status: 'Emitido', observacoes: f.observacoes || null,
    }).select('*').single()
    if (insC.error) { setSaving(false); setErro('Erro ao salvar contrato: ' + insC.error.message); return }
    const contrato = insC.data

    // 2) Cria as parcelas do contrato (schema leblanc)
    const parcelasCrm = simulacao.map((p) => ({
      contrato_id: contrato.id, numero: p.numero, valor: p.valor, vencimento: p.vencimento, status: 'Pendente',
    }))
    await crm.from('contrato_parcelas').insert(parcelasCrm)

    // 3) Integração: joga as mesmas parcelas no a_receber do Financeiro (le_admin)
    const receber = simulacao.map((p) => ({
      cliente_nome: f.cliente_nome.trim(),
      descricao: `Contrato ${numero}${nParc > 1 ? ` — parcela ${p.numero}/${nParc}` : ''}`,
      valor_parcela: p.valor, data_prevista: p.vencimento, status: 'Pendente',
      forma_recebimento: f.forma_pagamento,
    }))
    await supabase.from('a_receber').insert(receber)

    await registrarLog({ tabela: 'contratos', registroId: 0, acao: 'criacao', descricao: `Contrato ${numero} — ${f.cliente_nome} (${brl(valorFinal)})` })

    setSaving(false)
    setOk({ contrato, parcelas: simulacao, modeloNome: f.modelo_contrato })
  }

  if (ok) {
    return (
      <div>
        <div className="card" style={{ marginBottom: 18, borderColor: 'var(--ok)' }}>
          <h3>Contrato emitido ✓</h3>
          <div className="sub">Contrato <b>{ok.contrato.numero}</b> de {ok.contrato.cliente_nome} — {brl(ok.contrato.valor_final)} em {ok.parcelas.length}x. As parcelas já entraram em Recebíveis.</div>
          <div className="tools">
            <ContratoPDF contrato={ok.contrato} parcelas={ok.parcelas} />
            <button className="btn ghost" onClick={() => { setOk(null); setF(vazio()) }}>Novo contrato</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 920 }}>
      <h3>Novo contrato</h3>
      <div className="sub">O número do contrato é gerado automaticamente ao emitir. As parcelas caem no Financeiro (Recebíveis).</div>
      {erro && <div className="login-err" style={{ marginBottom: 14 }}>{erro}</div>}

      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '6px 0 12px' }}>Cliente</div>
      <div className="row-2">
        <div className="field"><label>Nome do cliente *</label><input className="input" value={f.cliente_nome} onChange={(e) => set('cliente_nome', e.target.value)} /></div>
        <div className="field"><label>CPF / CNPJ</label><input className="input" value={f.cliente_cpf} onChange={(e) => set('cliente_cpf', e.target.value)} /></div>
      </div>
      <div className="row-2">
        <div className="field"><label>Telefone</label><input className="input" value={f.cliente_telefone} onChange={(e) => set('cliente_telefone', e.target.value)} /></div>
        <div className="field"><label>Endereço</label><input className="input" value={f.cliente_endereco} onChange={(e) => set('cliente_endereco', e.target.value)} /></div>
      </div>
      <div className="field"><label>Ambientes / Projeto</label><textarea className="input" value={f.projeto_ambientes} onChange={(e) => set('projeto_ambientes', e.target.value)} placeholder="Ex.: AA - Estante de livros (Sala de Estar); Cozinha; Dormitório..." /></div>

      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '18px 0 12px' }}>Venda</div>
      <div className="row-3">
        <div className="field"><label>Vendedor</label>
          <select className="input" value={f.vendor} onChange={(e) => set('vendor', e.target.value)}>
            <option value="">— selecione —</option>
            {vendedores.map((v) => <option key={v.id} value={v.nome_completo}>{v.nome_completo}</option>)}
          </select></div>
        <div className="field"><label>Modelo de contrato</label>
          <select className="input" value={f.modelo_contrato} onChange={(e) => set('modelo_contrato', e.target.value)}>
            {(modelos.length ? modelos.map(m => m.nome) : ['Le Blanc', 'Bartzen']).map((n) => <option key={n}>{n}</option>)}
          </select></div>
        <div className="field"><label>Valor de tabela *</label><input className="input" type="number" step="0.01" value={f.valor_tabela} onChange={(e) => set('valor_tabela', e.target.value)} /></div>
      </div>
      <div className="row-2">
        <div className="field"><label>Desconto</label>
          <div className="flex">
            <select className="input" style={{ width: 80 }} value={f.desconto_tipo} onChange={(e) => set('desconto_tipo', e.target.value)}>
              <option value="%">%</option><option value="R$">R$</option>
            </select>
            <input className="input" type="number" step="0.01" value={f.desconto_entrada} onChange={(e) => set('desconto_entrada', e.target.value)} />
          </div>
        </div>
        <div className="field"><label>Valor com desconto</label><input className="input" value={brl(valorBase)} disabled /></div>
      </div>

      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '18px 0 12px' }}>Simulação de pagamento</div>
      <div className="row-3">
        <div className="field"><label>Forma de pagamento</label>
          <select className="input" value={f.forma_pagamento} onChange={(e) => set('forma_pagamento', e.target.value)}>
            {FORMAS.map((x) => <option key={x.v}>{x.v}</option>)}
          </select></div>
        <div className="field"><label>Nº de parcelas</label><input className="input" type="number" min="1" max="48" value={f.parcelas} onChange={(e) => set('parcelas', e.target.value)} /></div>
        <div className="field"><label>1ª parcela</label><input className="input" type="date" value={f.primeira_parcela} onChange={(e) => set('primeira_parcela', e.target.value)} /></div>
      </div>
      {(f.forma_pagamento === 'Cartão de crédito' || f.forma_pagamento === 'Financeira') && (
        <div className="row-2">
          <div className="field"><label>Taxa de juros (% ao mês)</label><input className="input" type="number" step="0.01" value={f.taxa_juros} onChange={(e) => set('taxa_juros', e.target.value)} placeholder="ex.: 2.5" /></div>
          <div className="field"><label>Intervalo entre parcelas (dias)</label><input className="input" type="number" value={f.intervalo} onChange={(e) => set('intervalo', e.target.value)} /></div>
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 8, boxShadow: 'none' }}>
        <table>
          <thead><tr><th>Parcela</th><th className="num">Valor</th><th>Vencimento</th></tr></thead>
          <tbody>
            {simulacao.map((p) => (
              <tr key={p.numero}><td>{p.numero}/{nParc}</td><td className="num">{brl(p.valor)}</td><td className="muted">{fmtDate(p.vencimento)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="between" style={{ margin: '10px 2px 0' }}>
        <span className="muted">Total do contrato</span>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>{brl(valorFinal)}</span>
      </div>

      <div className="field" style={{ marginTop: 16 }}><label>Observações</label><textarea className="input" value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>

      <button className="btn" onClick={salvar} disabled={saving} style={{ width: '100%', justifyContent: 'center', padding: 14, marginTop: 8 }}>
        <IcoPlus /> {saving ? 'Emitindo…' : 'Emitir contrato'}
      </button>
    </div>
  )
}
