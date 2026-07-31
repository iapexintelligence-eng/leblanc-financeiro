import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { brl, fmtDate, today, addMonths, addBusinessDays } from '../lib/format.js'
import { registrarLog } from '../lib/log.js'
import { IcoPlus } from '../components/Icons.jsx'
import { imprimirContrato } from '../components/ContratoDoc.jsx'
import { CARTAO, simularCartao, simularFinanceira } from '../lib/taxas.js'
import { useRole, podeTudo } from '../lib/useRole.js'
import { parsePromobXML } from '../lib/promob.js'

const FORMAS_PG = ['Pix / À vista', 'Débito', 'Crédito (cartão)', 'Financeira Santander']
const BANDEIRAS = Object.keys(CARTAO)
const linhaPgVazia = (valor = '') => ({ forma: 'Pix / À vista', valor, bandeira: 'Visa / Master / Elo', parcelas: 1, carencia: 30, prazoFin: 12, primeira: today() })
function calcForma(l) {
  const valor = Number(l.valor) || 0
  if (l.forma === 'Débito') return simularCartao(valor, l.bandeira, 'Débito', 1)
  if (l.forma === 'Crédito (cartão)') return simularCartao(valor, l.bandeira, 'Crédito', Number(l.parcelas) || 1)
  if (l.forma === 'Financeira Santander') return simularFinanceira(valor, Number(l.carencia), Number(l.prazoFin)) || { valorCliente: 0, parcela: 0, n: 0, lojaRecebe: 0, taxaCliente: 0 }
  return { valorCliente: valor, parcela: valor, n: 1, lojaRecebe: valor, taxaCliente: 0 }
}

const crm = supabase.schema('leblanc')
const FORMAS = ['Pix', 'À vista', 'Cartão de crédito', 'Financeira', 'Parcelado (loja)', 'Boleto']
const UFS = ['PR', 'SC', 'SP', 'RS', 'RJ', 'MG', 'Outro']
const INDUSTRIAS = ['Bartzen', 'Menezes', 'Sierra', 'Todeschini', 'Outra']
const LED_OPCOES = [
  'LED e instalação inclusos',
  'LED incluso',
  'Somente instalação — LED e fiação por conta do cliente',
  'LED não incluso',
  'Sem LED',
  'A definir (preencher depois)',
]
const EXTRA_TIPOS = ['Kit de montagem', 'Kit de espelhos', 'Kit de LED', 'Gordura no projeto', 'Serviço ao cliente (ex.: desmontagem)', 'Outro']
const extraVazio = () => ({ tipo: 'Kit de montagem', descricao: '', qtd: 1, valor: '', obs: '' })

const CAMPO_LABEL = {
  cliente_nome: 'Cliente', cliente_cpf: 'CPF/CNPJ', cliente_rg: 'RG', cliente_nascimento: 'Nascimento',
  cliente_telefone: 'Telefone', cliente_email: 'E-mail', cliente_profissao: 'Profissão',
  endereco: 'Endereço', bairro: 'Bairro', cidade: 'Cidade', uf: 'UF', cep: 'CEP',
  entrega_endereco: 'Endereço de entrega', prazo_entrega: 'Prazo de entrega', led_incluso: 'LED / Instalação',
  vendedor: 'Vendedor', loja: 'Loja', data_contrato: 'Data do contrato', tipo_contrato: 'Tipo', modelo_contrato: 'Modelo',
  condicao_pagamento: 'Condição de pagamento', forma_pagamento: 'Forma de pagamento',
  observacao_ambientes: 'Obs. ambientes', observacoes: 'Observações', local_orcamento: 'Local do orçamento',
  itens: 'Itens', parcelas: 'Parcelas', itens_extras: 'Itens extras (interno)',
}
function diffContrato(antes, depois) {
  const out = {}
  const keys = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})])
  for (const k of keys) {
    if (k === 'numero' || k === 'total_pedido') continue
    const a = antes ? antes[k] : undefined
    const b = depois ? depois[k] : undefined
    const obj = typeof a === 'object' || typeof b === 'object'
    const sa = obj ? JSON.stringify(a ?? null) : String(a ?? '')
    const sb = obj ? JSON.stringify(b ?? null) : String(b ?? '')
    if (sa !== sb) out[CAMPO_LABEL[k] || k] = obj ? ['(alterado)', '(atualizado)'] : [String(a ?? '—'), String(b ?? '—')]
  }
  return out
}

const itemVazio = () => ({ qtd: 1, descricao: '', fornecedor: '', linha: '', prazo: 35, valor: '', corpo: '', porta: '', puxador: '', complemento: '', modelo: '' })
const parcelaVazia = (n) => ({ numero: n, vencimento: today(), valor: '' })

const inicial = () => ({
  data_contrato: today(), loja: 'Curitiba', tipo_contrato: 'Normal',
  vendedor: '', modelo_contrato: 'Le Blanc',
  cliente_nome: '', cliente_cpf: '', cliente_rg: '', cliente_nascimento: '',
  cliente_telefone: '', cliente_email: '', cliente_profissao: '',
  endereco: '', bairro: '', cidade: 'Curitiba', uf: 'PR', cep: '',
  entrega_endereco: '', entrega_bairro: '', entrega_cidade: '', entrega_uf: 'PR', entrega_cep: '',
  prazo_entrega: 'Em dias úteis conforme ambientes',
  led_incluso: 'LED e instalação inclusos',
  itens: [itemVazio()],
  condicao_pagamento: '', forma_pagamento: 'Pix', data_entrada: '',
  parcelas: [parcelaVazia(1)],
  observacao_ambientes: '', observacoes: '',
  local_orcamento: '', itens_extras: [], comissao_marketing: '',
  desconto_tipo: '%', desconto_valor: '', desconto_aprovado: false, desconto_aprovado_por: '',
})
const LIMITE_DESCONTO = 35 // % máximo sem autorização da diretoria

export default function EmitirContrato() {
  const [f, setF] = useState(inicial())
  const [vendedores, setVendedores] = useState([])
  const [modelos, setModelos] = useState([])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(null)
  const [editId, setEditId] = useState(null)
  const [lista, setLista] = useState([])
  const [original, setOriginal] = useState(null)
  const [historico, setHistorico] = useState([])
  const [formasPg, setFormasPg] = useState([linhaPgVazia()])
  const [anexos, setAnexos] = useState([])
  const [uploading, setUploading] = useState('')
  const [fluxo, setFluxo] = useState(null)
  const [envio, setEnvio] = useState({ grupo: false, imagens: false })
  const [importInfo, setImportInfo] = useState('')

  const carregarLista = async () => {
    const c = await crm.from('contratos').select('id, numero, cliente_nome, valor_final, status, created_at').order('created_at', { ascending: false }).limit(30)
    if (!c.error) setLista(c.data || [])
  }
  const carregarHistorico = async (id) => {
    const h = await crm.from('contrato_historico').select('*').eq('contrato_id', id).order('editado_em', { ascending: false }).limit(50)
    setHistorico(h.error ? [] : (h.data || []))
  }
  const carregarAnexos = async (id) => {
    const a = await crm.from('contrato_anexos').select('*').eq('contrato_id', id).order('enviado_em', { ascending: false })
    setAnexos(a.error ? [] : (a.data || []))
  }
  const carregarFluxo = async (id) => {
    const { data } = await crm.from('projeto_fluxo').select('*').eq('contrato_id', id).maybeSingle()
    setFluxo(data || null)
    if (data) setEnvio({ grupo: !!data.grupo_criado, imagens: !!data.imagens_enviadas })
  }
  const enviarParaCorrecao = async () => {
    setErro('')
    if (!editId) { setErro('Salve o contrato antes de enviar para a Correção.'); return }
    if (!envio.grupo || !envio.imagens) { setErro('Marque "grupo criado" e "imagens enviadas ao cliente" antes de enviar.'); return }
    if (anexos.length === 0) { setErro('Anexe o print do grupo/imagens na pasta do cliente antes de enviar para a Correção.'); return }
    const { data: u } = await supabase.auth.getUser()
    const quem = u?.user?.email || 'sistema'
    const payload = {
      contrato_id: editId, etapa: 'correcao', grupo_criado: true, imagens_enviadas: true,
      enviado_correcao_em: new Date().toISOString(), correcao_prazo: addBusinessDays(today(), 12),
      devolvido: false, prioridade: false, updated_at: new Date().toISOString(),
    }
    const up = await crm.from('projeto_fluxo').upsert(payload, { onConflict: 'contrato_id' })
    if (up.error) { setErro('Erro ao enviar: ' + up.error.message); return }
    await crm.from('projeto_eventos').insert({ contrato_id: editId, tipo: 'envio_correcao', descricao: `Enviado para a Correção (prazo ${fmtDate(addBusinessDays(today(), 12))})`, setor: 'Vendas', autor: quem })
    carregarFluxo(editId)
  }
  const baixarAnexo = async (a) => {
    const { data, error } = await supabase.storage.from('pasta-cliente').createSignedUrl(a.path, 60)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
    else setErro('Não foi possível abrir o arquivo.')
  }
  const enviarArquivo = async (file, tipo) => {
    if (!file) return
    let id = editId
    if (!id) {
      if (!f.cliente_nome.trim()) { setErro('Informe o cliente e salve antes de anexar o arquivo.'); return }
      const c = await salvar()
      id = c?.id
      if (!id) return
    }
    setUploading(tipo)
    const safe = file.name.replace(/[^\w.\-]/g, '_')
    const path = `${id}/${tipo}/${Date.now()}_${safe}`
    const up = await supabase.storage.from('pasta-cliente').upload(path, file, { upsert: false })
    if (up.error) { setUploading(''); setErro('Erro no upload: ' + up.error.message); return }
    const { data: u } = await supabase.auth.getUser()
    await crm.from('contrato_anexos').insert({ contrato_id: id, tipo, nome_arquivo: file.name, path, tamanho: file.size, enviado_por: u?.user?.email || 'sistema' })
    setUploading('')
    carregarAnexos(id)
  }

  const importarPromob = async (file) => {
    if (!file) return
    setErro(''); setImportInfo('')
    try {
      const text = await file.text()
      const p = parsePromobXML(text)
      const industria = INDUSTRIAS.includes(p.fornecedor) ? p.fornecedor : (p.fornecedor || '')
      const itensNovos = (p.ambientes.length ? p.ambientes : [{ descricao: '', valor: p.total, fornecedor: industria }])
        .map((a) => ({ ...itemVazio(), descricao: a.descricao, valor: a.valor || '', fornecedor: industria }))
      setF((s) => ({
        ...s,
        cliente_nome: s.cliente_nome || p.cliente.cliente_nome,
        cliente_cpf: s.cliente_cpf || p.cliente.cliente_cpf,
        cliente_email: s.cliente_email || p.cliente.cliente_email,
        cliente_telefone: s.cliente_telefone || p.cliente.cliente_telefone,
        endereco: s.endereco || p.cliente.endereco,
        bairro: s.bairro || p.cliente.bairro,
        cidade: p.cliente.cidade || s.cidade,
        uf: p.cliente.uf || s.uf,
        cep: s.cep || p.cliente.cep,
        modelo_contrato: industria === 'Bartzen' ? 'Bartzen' : s.modelo_contrato,
        itens: itensNovos,
      }))
      setImportInfo(`Promob importado: ${p.ambientes.length || 1} ambiente(s) · ${industria || 'indústria não identificada'} · total ${brl(p.total)}. Confira os campos antes de salvar.`)
      // guarda o próprio XML na pasta do cliente (preço de fábrica)
      enviarArquivo(file, 'promob')
    } catch (e) {
      setErro('Não consegui ler o XML do Promob: ' + (e.message || e))
    }
  }

  useEffect(() => {
    (async () => {
      const fu = await supabase.from('funcionarios').select('id, nome_completo, tipo, ativo').eq('ativo', true).order('nome_completo')
      const fs = (fu.data || []); fs.sort((a, b) => (b.tipo === 'Vendedor') - (a.tipo === 'Vendedor'))
      setVendedores(fs)
      const m = await crm.from('contrato_modelos').select('nome, ativo').eq('ativo', true).order('nome')
      if (!m.error && m.data?.length) setModelos(m.data.map((x) => x.nome))
      carregarLista()
    })()
  }, [])

  const novoContrato = () => { setF(inicial()); setEditId(null); setSalvo(null); setErro(''); setOriginal(null); setHistorico([]); setAnexos([]); setFluxo(null); setEnvio({ grupo: false, imagens: false }) }

  const abrirContrato = async (id) => {
    setErro(''); setSalvo(null)
    const { data, error } = await crm.from('contratos').select('*').eq('id', id).single()
    if (error) { setErro('Erro ao abrir contrato: ' + error.message); return }
    const dj = data.dados_json && Object.keys(data.dados_json).length ? data.dados_json : null
    setOriginal(dj || null)
    carregarHistorico(id)
    carregarAnexos(id)
    carregarFluxo(id)
    if (dj) {
      setF({ ...inicial(), ...dj })
    } else {
      // contrato antigo (sem dados_json completo) — reconstrói o básico das colunas
      setF({ ...inicial(), numero: data.numero, cliente_nome: data.cliente_nome || '', cliente_cpf: data.cliente_cpf || '',
        cliente_telefone: data.cliente_telefone || '', endereco: data.cliente_endereco || '', vendedor: data.vendor || '',
        modelo_contrato: data.modelo_contrato || 'Le Blanc', forma_pagamento: data.forma_pagamento || 'Pix',
        observacoes: data.observacoes || '', itens: [{ ...itemVazio(), descricao: data.projeto_ambientes || '', valor: data.valor_final || '' }] })
    }
    setEditId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const setItem = (i, k, v) => setF((s) => ({ ...s, itens: s.itens.map((it, j) => j === i ? { ...it, [k]: v } : it) }))
  const addItem = () => setF((s) => ({ ...s, itens: [...s.itens, itemVazio()] }))
  const rmItem = (i) => setF((s) => ({ ...s, itens: s.itens.filter((_, j) => j !== i) }))
  const setParc = (i, k, v) => setF((s) => ({ ...s, parcelas: s.parcelas.map((p, j) => j === i ? { ...p, [k]: v } : p) }))
  const addParc = () => setF((s) => ({ ...s, parcelas: [...s.parcelas, parcelaVazia(s.parcelas.length + 1)] }))
  const rmParc = (i) => setF((s) => ({ ...s, parcelas: s.parcelas.filter((_, j) => j !== i).map((p, j) => ({ ...p, numero: j + 1 })) }))
  const setExtra = (i, k, v) => setF((s) => ({ ...s, itens_extras: s.itens_extras.map((it, j) => j === i ? { ...it, [k]: v } : it) }))
  const addExtra = () => setF((s) => ({ ...s, itens_extras: [...s.itens_extras, extraVazio()] }))
  const rmExtra = (i) => setF((s) => ({ ...s, itens_extras: s.itens_extras.filter((_, j) => j !== i) }))

  const role = useRole()
  const totalPedido = f.itens.reduce((s, it) => s + (Number(it.valor) || 0), 0)
  const totalParcelas = f.parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  const totalExtras = f.itens_extras.reduce((s, it) => s + (Number(it.valor) || 0), 0)

  // ---- Desconto ao cliente (trava 35%) ----
  const descVal = Number(f.desconto_valor) || 0
  const descontoValor = f.desconto_tipo === '%' ? totalPedido * descVal / 100 : descVal
  const descontoPct = totalPedido > 0 ? (descontoValor / totalPedido) * 100 : 0
  const valorFinal = Math.max(0, totalPedido - descontoValor)
  const precisaAprovacao = descontoPct > LIMITE_DESCONTO + 0.001
  const bloqueadoDesconto = precisaAprovacao && !f.desconto_aprovado

  // ---- Simulador de pagamento (misto) ----
  const setFP = (i, k, v) => setFormasPg((s) => s.map((l, j) => j === i ? { ...l, [k]: v } : l))
  const addFP = () => setFormasPg((s) => [...s, linhaPgVazia()])
  const rmFP = (i) => setFormasPg((s) => s.filter((_, j) => j !== i))
  const preencherTotal = () => setFormasPg([linhaPgVazia(valorFinal)])
  const calcPg = formasPg.map(calcForma)
  const pgAlocado = formasPg.reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const pgRestante = valorFinal - pgAlocado
  const pgCliente = calcPg.reduce((s, r) => s + (r.valorCliente || 0), 0)
  const pgLoja = calcPg.reduce((s, r) => s + (r.lojaRecebe || 0), 0)

  const aplicarSimulacao = () => {
    const out = []
    let num = 0
    formasPg.forEach((l, idx) => {
      const r = calcForma(l)
      const n = r.n || 1
      const primeira = l.primeira || today()
      for (let i = 0; i < n; i++) { num++; out.push({ numero: num, valor: r.parcela, vencimento: i === 0 ? primeira : addMonths(primeira, i) }) }
    })
    if (!out.length) return
    const resumo = formasPg.map((l) => l.forma === 'Crédito (cartão)' ? `Cartão ${l.parcelas}x` : l.forma === 'Financeira Santander' ? `Financeira ${l.prazoFin}x` : l.forma).join(' + ')
    setF((s) => ({ ...s, parcelas: out, forma_pagamento: resumo, condicao_pagamento: s.condicao_pagamento || resumo }))
  }

  // Gera parcelas automaticamente a partir de nº, valor e intervalo
  const gerarParcelas = (n, intervaloDias = 30) => {
    n = Math.max(1, Number(n) || 1)
    const valorCada = totalPedido / n
    const base = f.parcelas[0]?.vencimento || today()
    setF((s) => ({ ...s, parcelas: Array.from({ length: n }, (_, i) => ({
      numero: i + 1, valor: valorCada.toFixed(2),
      vencimento: i === 0 ? base : addMonths(base, Math.round((i * intervaloDias) / 30)),
    })) }))
  }

  const gerarNumero = () => {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  }

  const montarDados = (numero) => ({ ...f, numero, total_pedido: totalPedido })

  const salvar = async () => {
    setErro('')
    if (!f.cliente_nome.trim()) { setErro('Informe ao menos o nome do cliente.'); return }
    setSaving(true)
    const numero = f.numero || gerarNumero()
    const ambientesTxt = f.itens.filter((it) => it.descricao).map((it) => `${it.descricao}${it.linha ? ` (${it.linha})` : ''}`).join('; ')
    const status = bloqueadoDesconto ? 'Aguardando aprovação' : (totalPedido > 0 ? 'Emitido' : 'Rascunho')
    const payload = {
      numero, cliente_nome: f.cliente_nome.trim(), cliente_cpf: f.cliente_cpf || null,
      cliente_telefone: f.cliente_telefone || null,
      cliente_endereco: [f.endereco, f.bairro, f.cidade, f.uf].filter(Boolean).join(', ') || null,
      projeto_ambientes: ambientesTxt || null, vendor: f.vendedor || null,
      modelo_contrato: f.modelo_contrato, valor_tabela: totalPedido,
      desconto_tipo: f.desconto_tipo, desconto_entrada: descVal, valor_desconto: descontoValor, valor_final: valorFinal,
      forma_pagamento: f.forma_pagamento, parcelas: f.parcelas.length,
      status, observacoes: f.observacoes || null, dados_json: montarDados(numero),
    }
    let contrato
    if (editId) {
      const up = await crm.from('contratos').update(payload).eq('id', editId).select('*').single()
      if (up.error) { setSaving(false); setErro('Erro ao atualizar: ' + up.error.message); return }
      contrato = up.data
      await crm.from('contrato_parcelas').delete().eq('contrato_id', editId)
      await supabase.from('a_receber').delete().ilike('descricao', `Contrato ${numero} —%`)
    } else {
      const ins = await crm.from('contratos').insert(payload).select('*').single()
      if (ins.error) { setSaving(false); setErro('Erro ao salvar: ' + ins.error.message); return }
      contrato = ins.data; setEditId(contrato.id)
    }

    const parcelasValidas = f.parcelas.filter((p) => Number(p.valor) > 0)
    if (parcelasValidas.length) {
      await crm.from('contrato_parcelas').insert(parcelasValidas.map((p) => ({
        contrato_id: contrato.id, numero: p.numero, valor: Number(p.valor), vencimento: p.vencimento, status: 'Pendente',
      })))
      await supabase.from('a_receber').insert(parcelasValidas.map((p) => ({
        cliente_nome: f.cliente_nome.trim(),
        descricao: `Contrato ${numero} — parcela ${p.numero}/${parcelasValidas.length}`,
        valor_parcela: Number(p.valor), data_prevista: p.vencimento, status: 'Pendente', forma_recebimento: f.forma_pagamento,
      })))
    }
    // Histórico: quem, quando e o que mudou
    const { data: u } = await supabase.auth.getUser()
    const quem = u?.user?.email || 'sistema'
    const snapshot = montarDados(numero)
    const campos = editId ? diffContrato(original, snapshot) : {}
    let descricao = editId
      ? (Object.keys(campos).length ? 'Alterou: ' + Object.keys(campos).join(', ') : 'Salvou sem mudanças')
      : 'Contrato criado'
    if (bloqueadoDesconto) descricao += ` · AGUARDANDO APROVAÇÃO — desconto ${descontoPct.toFixed(1)}% (acima de ${LIMITE_DESCONTO}%)`
    await crm.from('contrato_historico').insert({
      contrato_id: contrato.id, numero, acao: editId ? 'edicao' : 'criacao',
      alteracoes: { campos, snapshot }, descricao, editado_por: quem,
    })
    await registrarLog({ tabela: 'contratos', registroId: 0, acao: editId ? 'edicao' : 'criacao',
      descricao: `Contrato ${numero} — ${f.cliente_nome}${bloqueadoDesconto ? ' · APROVAÇÃO DE DESCONTO PENDENTE (diretoria informada)' : ''}` })

    setSaving(false)
    setF((s) => ({ ...s, numero }))
    setOriginal(snapshot)
    setSalvo({ ...snapshot, id: contrato.id, status })
    carregarLista(); carregarHistorico(contrato.id)
    return contrato
  }

  const imprimir = () => imprimirContrato(salvo || montarDados(f.numero || gerarNumero()))

  const aprovarDesconto = async () => {
    if (!editId) { setErro('Salve o contrato antes de aprovar o desconto.'); return }
    const novoDados = { ...montarDados(f.numero), desconto_aprovado: true, desconto_aprovado_por: role.email }
    const up = await crm.from('contratos').update({ status: 'Emitido', dados_json: novoDados }).eq('id', editId)
    if (up.error) { setErro('Erro ao aprovar: ' + up.error.message); return }
    await crm.from('contrato_historico').insert({ contrato_id: editId, numero: f.numero, acao: 'edicao', descricao: `Desconto ${descontoPct.toFixed(1)}% APROVADO pela diretoria`, editado_por: role.email, alteracoes: { campos: {} } })
    setF((s) => ({ ...s, desconto_aprovado: true, desconto_aprovado_por: role.email }))
    carregarHistorico(editId); carregarLista()
  }

  const S = { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '20px 0 12px', borderTop: '1px solid var(--line)', paddingTop: 16 }

  return (
    <div className="card" style={{ maxWidth: 1000 }}>
      <div className="between">
        <div>
          <h3>{editId ? 'Editar contrato' : 'Emitir contrato'}</h3>
          <div className="sub">{editId ? `Editando o contrato ${f.numero || ''} — complete e salve novamente.` : 'Preencha, salve no sistema e imprima o documento formatado.'}</div>
        </div>
        <div className="tools">
          {editId && <button className="btn ghost" onClick={novoContrato}>+ Novo (limpar)</button>}
          <button className="btn ghost" onClick={imprimir}>Imprimir / PDF</button>
          <button className="btn" onClick={salvar} disabled={saving}><IcoPlus /> {saving ? 'Salvando…' : (editId ? 'Atualizar contrato' : 'Salvar contrato')}</button>
        </div>
      </div>
      {erro && <div className="login-err" style={{ margin: '12px 0' }}>{erro}</div>}
      {salvo && <div className="badge ok" style={{ margin: '12px 0', display: 'inline-block' }}>Contrato {salvo.numero} {salvo.status === 'Rascunho' ? 'salvo como RASCUNHO (você pode completar depois)' : 'salvo · parcelas no Recebíveis'}</div>}

      {lista.length > 0 && (
        <details style={{ margin: '10px 0 16px', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>Contratos salvos ({lista.length}) — clique para reabrir e completar depois</summary>
          <div className="table-wrap" style={{ boxShadow: 'none', marginTop: 10 }}>
            <table>
              <thead><tr><th>Número</th><th>Cliente</th><th className="num">Valor</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.numero}</td>
                    <td>{c.cliente_nome}</td>
                    <td className="num">{brl(c.valor_final)}</td>
                    <td>{c.status === 'Rascunho' ? <span className="badge warn">Rascunho</span> : <span className="badge ok">{c.status || 'Emitido'}</span>}</td>
                    <td className="right"><button className="btn ghost sm" onClick={() => abrirContrato(c.id)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {editId && historico.length > 0 && (
        <details style={{ margin: '10px 0 16px', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>Histórico de alterações ({historico.length}) — quem mexeu e o que mudou</summary>
          <div className="stack" style={{ gap: 10, marginTop: 12 }}>
            {historico.map((h) => (
              <div key={h.id} style={{ borderLeft: '2px solid var(--line-strong)', paddingLeft: 12 }}>
                <div className="between">
                  <span style={{ fontSize: 13 }}><b>{h.editado_por || 'sistema'}</b> · {h.acao === 'criacao' ? 'criou' : 'editou'}</span>
                  <span className="faint" style={{ fontSize: 12 }}>{new Date(h.editado_em).toLocaleString('pt-BR')}</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>{h.descricao}</div>
                {h.alteracoes?.campos && Object.keys(h.alteracoes.campos).length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {Object.entries(h.alteracoes.campos).map(([campo, par]) => (
                      <div key={campo}><b>{campo}:</b> <span className="faint">{String(par[0])}</span> → {String(par[1])}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{ ...S, borderTop: 'none', paddingTop: 0 }}>Importar orçamento do Promob (XML)</div>
      <div style={{ border: '1px solid var(--brand, var(--line-strong))', borderRadius: 10, padding: 14, background: 'var(--surface)' }}>
        <div className="sub" style={{ marginBottom: 8 }}>Suba o XML exportado do Promob e o sistema preenche cliente, ambientes, indústria e valores automaticamente. Depois é só conferir e completar.</div>
        <input className="input" type="file" accept=".xml,text/xml,application/xml" onChange={(e) => { importarPromob(e.target.files?.[0]); e.target.value = '' }} />
        {importInfo && <div className="badge ok" style={{ display: 'inline-block', marginTop: 10 }}>{importInfo}</div>}
      </div>

      <div style={{ ...S }}>Pasta do cliente — arquivos</div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
        <div className="row-2">
          <div className="field" style={{ margin: 0 }}>
            <label>Arquivo do Promob (PDF/impressão)</label>
            <input className="input" type="file" onChange={(e) => { enviarArquivo(e.target.files?.[0], 'promob'); e.target.value = '' }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Outro anexo (imagens, documentos)</label>
            <input className="input" type="file" onChange={(e) => { enviarArquivo(e.target.files?.[0], 'anexo'); e.target.value = '' }} />
          </div>
        </div>
        {uploading && <div className="sub" style={{ marginTop: 8 }}>Enviando arquivo ({uploading})…</div>}
        {!editId && <div className="sub" style={{ marginTop: 8, color: 'var(--warn)' }}>Ao anexar, o contrato é salvo como rascunho automaticamente para criar a pasta (informe ao menos o cliente).</div>}
        {anexos.length > 0 && (
          <div className="table-wrap" style={{ boxShadow: 'none', marginTop: 12 }}>
            <table>
              <thead><tr><th>Arquivo</th><th>Tipo</th><th>Enviado por</th><th>Quando</th><th></th></tr></thead>
              <tbody>
                {anexos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nome_arquivo}</td>
                    <td><span className="badge neutral">{a.tipo}</span></td>
                    <td className="muted">{a.enviado_por || '—'}</td>
                    <td className="muted">{new Date(a.enviado_em).toLocaleString('pt-BR')}</td>
                    <td className="right"><button className="btn ghost sm" onClick={() => baixarAnexo(a)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={S}>Dados do contrato</div>
      <div className="row-3">
        <div className="field"><label>Responsável pela venda</label>
          <select className="input" value={f.vendedor} onChange={(e) => set('vendedor', e.target.value)}>
            <option value="">— selecione —</option>{vendedores.map((v) => <option key={v.id} value={v.nome_completo}>{v.nome_completo}</option>)}
          </select></div>
        <div className="field"><label>Loja</label><input className="input" value={f.loja} onChange={(e) => set('loja', e.target.value)} /></div>
        <div className="field"><label>Data do contrato</label><input className="input" type="date" value={f.data_contrato} onChange={(e) => set('data_contrato', e.target.value)} /></div>
      </div>
      <div className="row-2">
        <div className="field"><label>Modelo de contrato</label>
          <select className="input" value={f.modelo_contrato} onChange={(e) => set('modelo_contrato', e.target.value)}>
            {(modelos.length ? modelos : ['Le Blanc', 'Bartzen']).map((n) => <option key={n}>{n}</option>)}
          </select></div>
        <div className="field"><label>Tipo de contrato</label><input className="input" value={f.tipo_contrato} onChange={(e) => set('tipo_contrato', e.target.value)} /></div>
      </div>

      <div style={S}>Cliente</div>
      <div className="row-2">
        <div className="field"><label>Nome completo *</label><input className="input" value={f.cliente_nome} onChange={(e) => set('cliente_nome', e.target.value)} /></div>
        <div className="field"><label>CPF / CNPJ</label><input className="input" value={f.cliente_cpf} onChange={(e) => set('cliente_cpf', e.target.value)} /></div>
      </div>
      <div className="row-3">
        <div className="field"><label>RG / Inscrição</label><input className="input" value={f.cliente_rg} onChange={(e) => set('cliente_rg', e.target.value)} /></div>
        <div className="field"><label>Nascimento</label><input className="input" type="date" value={f.cliente_nascimento} onChange={(e) => set('cliente_nascimento', e.target.value)} /></div>
        <div className="field"><label>Telefone</label><input className="input" value={f.cliente_telefone} onChange={(e) => set('cliente_telefone', e.target.value)} /></div>
      </div>
      <div className="row-2">
        <div className="field"><label>E-mail</label><input className="input" value={f.cliente_email} onChange={(e) => set('cliente_email', e.target.value)} /></div>
        <div className="field"><label>Profissão</label><input className="input" value={f.cliente_profissao} onChange={(e) => set('cliente_profissao', e.target.value)} /></div>
      </div>
      <div className="field"><label>Endereço</label><input className="input" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></div>
      <div className="row-3">
        <div className="field"><label>Bairro</label><input className="input" value={f.bairro} onChange={(e) => set('bairro', e.target.value)} /></div>
        <div className="field"><label>Cidade</label><input className="input" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></div>
        <div className="field"><label>UF / CEP</label>
          <div className="flex"><select className="input" style={{ width: 80 }} value={f.uf} onChange={(e) => set('uf', e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
          <input className="input" value={f.cep} onChange={(e) => set('cep', e.target.value)} placeholder="CEP" /></div></div>
      </div>
      <div className="field"><label>Endereço de entrega (se diferente)</label><input className="input" value={f.entrega_endereco} onChange={(e) => set('entrega_endereco', e.target.value)} /></div>
      <div className="row-3">
        <div className="field"><label>Prazo de entrega</label><input className="input" value={f.prazo_entrega} onChange={(e) => set('prazo_entrega', e.target.value)} /></div>
        <div className="field"><label>LED / Instalação</label>
          <select className="input" value={f.led_incluso} onChange={(e) => set('led_incluso', e.target.value)}>
            {LED_OPCOES.map((o) => <option key={o}>{o}</option>)}
          </select></div>
        <div className="field"><label>Observação dos ambientes</label><input className="input" value={f.observacao_ambientes} onChange={(e) => set('observacao_ambientes', e.target.value)} placeholder="Ex.: tomadas por conta do cliente" /></div>
      </div>

      <div style={S}>Ambientes / Itens</div>
      <datalist id="lista-industrias">{INDUSTRIAS.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="sub" style={{ marginTop: -4, marginBottom: 8 }}>No campo <b>Fornecedor</b> escolha a indústria (Bartzen, Menezes…) — pode digitar ou selecionar da lista.</div>
      <div className="table-wrap" style={{ boxShadow: 'none' }}>
        <table>
          <thead><tr><th>Qtd</th><th>Descrição / Ambiente</th><th>Fornecedor</th><th>Linha</th><th>Prazo</th><th className="num">Valor</th><th></th></tr></thead>
          <tbody>
            {f.itens.map((it, i) => (
              <tr key={i}>
                <td><input className="input" style={{ width: 55 }} type="number" value={it.qtd} onChange={(e) => setItem(i, 'qtd', e.target.value)} /></td>
                <td><input className="input" value={it.descricao} onChange={(e) => setItem(i, 'descricao', e.target.value)} placeholder="Ex.: Estante de livros" /></td>
                <td><input className="input" style={{ width: 120 }} list="lista-industrias" value={it.fornecedor} onChange={(e) => setItem(i, 'fornecedor', e.target.value)} placeholder="Indústria" /></td>
                <td><input className="input" style={{ width: 110 }} value={it.linha} onChange={(e) => setItem(i, 'linha', e.target.value)} placeholder="Sala de Estar" /></td>
                <td><input className="input" style={{ width: 60 }} type="number" value={it.prazo} onChange={(e) => setItem(i, 'prazo', e.target.value)} /></td>
                <td><input className="input" style={{ width: 110 }} type="number" step="0.01" value={it.valor} onChange={(e) => setItem(i, 'valor', e.target.value)} /></td>
                <td><button className="icon-btn" onClick={() => rmItem(i)} disabled={f.itens.length === 1}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="between" style={{ marginTop: 10 }}>
        <button className="btn ghost sm" onClick={addItem}><IcoPlus /> Adicionar item</button>
        <div>Total do pedido: <b style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>{brl(totalPedido)}</b></div>
      </div>

      <div style={S}>Desconto ao cliente</div>
      <div className="row-3">
        <div className="field"><label>Desconto</label>
          <div className="flex">
            <select className="input" style={{ width: 78 }} value={f.desconto_tipo} onChange={(e) => set('desconto_tipo', e.target.value)}><option value="%">%</option><option value="R$">R$</option></select>
            <input className="input" type="number" step="0.01" value={f.desconto_valor} onChange={(e) => set('desconto_valor', e.target.value)} />
          </div></div>
        <div className="field"><label>Desconto aplicado</label><input className="input" value={`${brl(descontoValor)} · ${descontoPct.toFixed(1)}%`} disabled /></div>
        <div className="field"><label>Valor final</label><input className="input" value={brl(valorFinal)} disabled /></div>
      </div>
      {precisaAprovacao && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, background: f.desconto_aprovado ? 'var(--ok-bg)' : 'var(--warn-bg)', color: f.desconto_aprovado ? 'var(--ok)' : 'var(--warn)' }}>
          {f.desconto_aprovado
            ? `✓ Desconto de ${descontoPct.toFixed(1)}% APROVADO pela diretoria${f.desconto_aprovado_por ? ` (${f.desconto_aprovado_por})` : ''}.`
            : `⚠ Desconto de ${descontoPct.toFixed(1)}% acima do limite de ${LIMITE_DESCONTO}% — precisa de autorização da diretoria. Ao salvar, o contrato fica "Aguardando aprovação" e a diretoria é informada.`}
          {!f.desconto_aprovado && podeTudo(role.papel) && (
            <div style={{ marginTop: 8 }}><button className="btn sm" onClick={aprovarDesconto}>Autorizar desconto (diretoria)</button></div>
          )}
        </div>
      )}

      <div style={S}>Pagamento — simulação</div>
      <div className="row-2">
        <div className="field"><label>Condição de pagamento (texto que sai no contrato)</label><input className="input" value={f.condicao_pagamento} onChange={(e) => set('condicao_pagamento', e.target.value)} placeholder="Ex.: entrada 60% + 40%, ou 6x no cartão" /></div>
        <div className="field"><label>Data da entrada</label><input className="input" type="date" value={f.data_entrada} onChange={(e) => set('data_entrada', e.target.value)} /></div>
      </div>
      <div className="between" style={{ marginBottom: 8 }}>
        <span className="sub">Monte a forma (pode misturar). Valor a pagar (após desconto): <b>{brl(valorFinal)}</b></span>
        <button className="btn ghost sm" onClick={preencherTotal}>Usar o total numa forma só</button>
      </div>
      {formasPg.map((l, i) => {
        const r = calcPg[i]
        return (
          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div className="row-2">
              <div className="field" style={{ margin: 0 }}><label>Forma</label>
                <select className="input" value={l.forma} onChange={(e) => setFP(i, 'forma', e.target.value)}>{FORMAS_PG.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="field" style={{ margin: 0 }}><label>Valor nesta forma</label><input className="input" type="number" step="0.01" value={l.valor} onChange={(e) => setFP(i, 'valor', e.target.value)} /></div>
            </div>
            {l.forma === 'Crédito (cartão)' && (
              <div className="row-3" style={{ marginTop: 10 }}>
                <div className="field" style={{ margin: 0 }}><label>Bandeira</label><select className="input" value={l.bandeira} onChange={(e) => setFP(i, 'bandeira', e.target.value)}>{BANDEIRAS.map((b) => <option key={b}>{b}</option>)}</select></div>
                <div className="field" style={{ margin: 0 }}><label>Parcelas</label><input className="input" type="number" min="1" max="21" value={l.parcelas} onChange={(e) => setFP(i, 'parcelas', e.target.value)} /></div>
                <div className="field" style={{ margin: 0 }}><label>1ª parcela</label><input className="input" type="date" value={l.primeira} onChange={(e) => setFP(i, 'primeira', e.target.value)} /></div>
              </div>
            )}
            {l.forma === 'Débito' && (
              <div className="field" style={{ marginTop: 10 }}><label>Bandeira</label><select className="input" value={l.bandeira} onChange={(e) => setFP(i, 'bandeira', e.target.value)}>{BANDEIRAS.filter((b) => CARTAO[b].debito != null).map((b) => <option key={b}>{b}</option>)}</select></div>
            )}
            {l.forma === 'Financeira Santander' && (
              <div className="row-3" style={{ marginTop: 10 }}>
                <div className="field" style={{ margin: 0 }}><label>Carência</label><select className="input" value={l.carencia} onChange={(e) => setFP(i, 'carencia', e.target.value)}><option value={30}>30 dias</option><option value={60}>60 dias</option></select></div>
                <div className="field" style={{ margin: 0 }}><label>Prazo</label><input className="input" type="number" min="1" max="24" value={l.prazoFin} onChange={(e) => setFP(i, 'prazoFin', e.target.value)} /></div>
                <div className="field" style={{ margin: 0 }}><label>1ª parcela</label><input className="input" type="date" value={l.primeira} onChange={(e) => setFP(i, 'primeira', e.target.value)} /></div>
              </div>
            )}
            <div className="between" style={{ marginTop: 10, fontSize: 13 }}>
              <span className="muted">{r.n > 1 ? `${r.n}x de ${brl(r.parcela)}` : `1x de ${brl(r.parcela)}`}{r.taxaCliente ? ` · taxa ${r.taxaCliente}%` : ' · sem taxa'}</span>
              <span>Cliente: <b>{brl(r.valorCliente)}</b> · Loja: <b>{brl(r.lojaRecebe)}</b>{formasPg.length > 1 && <button className="icon-btn" style={{ marginLeft: 8 }} onClick={() => rmFP(i)}>×</button>}</span>
            </div>
          </div>
        )
      })}
      <div className="between" style={{ marginBottom: 10 }}>
        <button className="btn ghost sm" onClick={addFP}><IcoPlus /> Adicionar forma (misto)</button>
        <span className={Math.abs(pgRestante) > 0.5 ? 'badge warn' : 'badge ok'}>A alocar: {brl(pgRestante)}</span>
      </div>
      <div className="between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span className="muted">Cliente paga <b>{brl(pgCliente)}</b> · Loja recebe líquido <b>{brl(pgLoja)}</b></span>
        <button className="btn" onClick={aplicarSimulacao}>Aplicar ao contrato → gerar parcelas</button>
      </div>
      <div className="sub" style={{ marginBottom: 8 }}>Parcelas geradas (pode ajustar manualmente abaixo):</div>
      <div className="table-wrap" style={{ boxShadow: 'none' }}>
        <table>
          <thead><tr><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th></th></tr></thead>
          <tbody>
            {f.parcelas.map((p, i) => (
              <tr key={i}>
                <td>{p.numero}</td>
                <td><input className="input" style={{ width: 160 }} type="date" value={p.vencimento} onChange={(e) => setParc(i, 'vencimento', e.target.value)} /></td>
                <td><input className="input" style={{ width: 120 }} type="number" step="0.01" value={p.valor} onChange={(e) => setParc(i, 'valor', e.target.value)} /></td>
                <td><button className="icon-btn" onClick={() => rmParc(i)} disabled={f.parcelas.length === 1}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="between" style={{ marginTop: 10 }}>
        <button className="btn ghost sm" onClick={addParc}><IcoPlus /> Adicionar parcela</button>
        <div className={Math.abs(totalParcelas - totalPedido) > 0.5 ? 'badge warn' : 'badge ok'}>
          Parcelas: {brl(totalParcelas)} {Math.abs(totalParcelas - totalPedido) > 0.5 ? `(difere do total ${brl(totalPedido)})` : '· confere com o total'}
        </div>
      </div>

      <div style={{ ...S, marginTop: 24, border: '1px solid var(--warn)', borderRadius: 10, padding: 16, background: 'var(--warn-bg)', color: 'var(--warn)' }}>
        🔒 Itens extras (interno) — NÃO sai no contrato do cliente · só o financeiro vê
      </div>
      <div style={{ border: '1px solid var(--warn-bg)', borderRadius: 10, padding: 16, marginTop: -6 }}>
        <div className="row-2">
          <div className="field"><label>Onde foi feito o orçamento</label><input className="input" value={f.local_orcamento} onChange={(e) => set('local_orcamento', e.target.value)} placeholder="Ex.: Promob, planilha…" /></div>
          <div className="field"><label>Comissão do marketing (R$)</label><input className="input" type="number" step="0.01" value={f.comissao_marketing} onChange={(e) => set('comissao_marketing', e.target.value)} placeholder="valor interno" /></div>
        </div>
        <div className="table-wrap" style={{ boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd</th><th className="num">Valor</th><th>Observação</th><th></th></tr></thead>
            <tbody>
              {f.itens_extras.length === 0 && <tr><td colSpan="6" className="empty">Nenhum item extra. Adicione kits, gordura ou serviços internos.</td></tr>}
              {f.itens_extras.map((it, i) => (
                <tr key={i}>
                  <td><select className="input" style={{ width: 200 }} value={it.tipo} onChange={(e) => setExtra(i, 'tipo', e.target.value)}>{EXTRA_TIPOS.map((t) => <option key={t}>{t}</option>)}</select></td>
                  <td><input className="input" value={it.descricao} onChange={(e) => setExtra(i, 'descricao', e.target.value)} placeholder="Ex.: Kit espelho quarto" /></td>
                  <td><input className="input" style={{ width: 55 }} type="number" value={it.qtd} onChange={(e) => setExtra(i, 'qtd', e.target.value)} /></td>
                  <td><input className="input" style={{ width: 100 }} type="number" step="0.01" value={it.valor} onChange={(e) => setExtra(i, 'valor', e.target.value)} /></td>
                  <td><input className="input" value={it.obs} onChange={(e) => setExtra(i, 'obs', e.target.value)} /></td>
                  <td><button className="icon-btn" onClick={() => rmExtra(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="between" style={{ marginTop: 10 }}>
          <button className="btn ghost sm" onClick={addExtra}><IcoPlus /> Adicionar item extra</button>
          <div className="badge neutral">Total interno (extras): {brl(totalExtras)}</div>
        </div>
      </div>

      <div className="field" style={{ marginTop: 18 }}><label>Observações do contrato</label><textarea className="input" value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>

      <div className="tools" style={{ marginTop: 8 }}>
        <button className="btn" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar contrato'}</button>
        <button className="btn ghost" onClick={imprimir}>Imprimir / Gerar PDF</button>
      </div>

      <div style={S}>Envio para a Correção</div>
      {fluxo && fluxo.etapa !== 'vendedor' ? (
        <div className="badge ok" style={{ display: 'inline-block' }}>✓ Já na etapa "{fluxo.etapa}" · enviado à Correção em {fmtDate(fluxo.enviado_correcao_em)} · prazo {fmtDate(fluxo.correcao_prazo)}</div>
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
          {fluxo?.devolvido && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 13 }}>⚠ Devolvido pela Correção: <b>{fluxo.devolucao_motivo}</b>. Resolva e reenvie.</div>}
          <label className="flex" style={{ cursor: 'pointer', marginBottom: 8 }}><input type="checkbox" checked={envio.grupo} onChange={(e) => setEnvio({ ...envio, grupo: e.target.checked })} /> Grupo (WhatsApp) do cliente já criado</label>
          <label className="flex" style={{ cursor: 'pointer', marginBottom: 10 }}><input type="checkbox" checked={envio.imagens} onChange={(e) => setEnvio({ ...envio, imagens: e.target.checked })} /> Imagens enviadas ao cliente</label>
          <div className="sub" style={{ marginBottom: 10 }}>Anexe o print do grupo e as imagens na "Pasta do cliente" (acima). Só dá pra enviar com os dois itens marcados e ao menos um anexo.</div>
          <button className="btn" onClick={enviarParaCorrecao} disabled={!envio.grupo || !envio.imagens || anexos.length === 0}>Enviar para a Correção</button>
        </div>
      )}
    </div>
  )
}
