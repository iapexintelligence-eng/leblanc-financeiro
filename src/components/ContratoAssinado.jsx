import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { anexarJornada } from '../lib/jornada.js'
import { extrairTexto } from '../lib/pdfLer.js'
import { parseContrato, escolherNome } from '../lib/lerContrato.js'
import { ocrImagemAuto } from '../lib/ocr.js'
import { acharVendedor, sugerirVinculo } from '../lib/contratoAssinado.js'
import { registrarLog } from '../lib/log.js'
import { brl, fmtDate } from '../lib/format.js'
import { hojeSP } from '../lib/prazos.js'

// "Novo registro" a partir do contrato assinado: sobe o PDF (ou foto), lê cliente, CPF, data, valor e
// vendedor, e cria de uma vez a venda, o contrato no sistema e a ficha do cliente.
const VAZIO = { cliente_nome: '', cliente_cpf: '', cliente_telefone: '', cliente_endereco: '', data_contrato: '', valor: '', vendedor: '', forma_pagamento: '' }

export default function ContratoAssinado({ contratos, comFicha, tipoVenda, onCriado }) {
  const [arquivo, setArquivo] = useState(null) // { path, nome }
  const [f, setF] = useState(VAZIO)
  const [lendo, setLendo] = useState(''), [erro, setErro] = useState(''), [salvando, setSalvando] = useState(false)
  const [vendedores, setVendedores] = useState([]), [vendas, setVendas] = useState([])
  const [vinculo, setVinculo] = useState('nova'), [escolheu, setEscolheu] = useState(false)

  useEffect(() => {
    (async () => {
      const [u, v] = await Promise.all([
        supabase.from('usuarios_sistema').select('nome').eq('ativo', true).eq('papel', 'vendedor').order('nome'),
        supabase.from('vendas').select('id, cliente_nome, data_venda, valor_vendido, vendedor').order('id', { ascending: false }).limit(1000),
      ])
      setVendedores((u.data || []).map((x) => x.nome))
      setVendas(v.data || [])
    })()
  }, [])

  const sug = useMemo(() => sugerirVinculo({ cliente: f.cliente_nome, data: f.data_contrato, contratos, comFicha, vendas }), [f.cliente_nome, f.data_contrato, contratos, comFicha, vendas])
  const padrao = sug.padrao.tipo === 'nova' ? 'nova' : `${sug.padrao.tipo}:${sug.padrao.id}`
  useEffect(() => { if (!escolheu) setVinculo(padrao) }, [padrao, escolheu])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  async function escolher(file) {
    if (!file) return
    setErro(''); setArquivo(null); setLendo('Enviando o contrato…')
    const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const ehImg = file.type?.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(file.name)
    if (!ehPdf && !ehImg) { setLendo(''); setErro('Envie o contrato em PDF ou foto.'); return }
    try {
      const envio = anexarJornada(file)
      let texto = ''
      try {
        if (ehPdf) { setLendo('Lendo o contrato…'); texto = await extrairTexto(file) }
        else texto = (await ocrImagemAuto(file, { onProgress: (p) => setLendo(`Lendo a foto do contrato… ${p}%`) })).join(' ')
      } catch (_) { texto = '' }
      const path = await envio
      setArquivo({ path, nome: file.name })
      const p = parseContrato(texto)
      // Nome lido no texto; se não houver, o do arquivo ("CONTRATO_LE_BLANC_Fulano_de_Tal.pdf").
      const cliente = escolherNome(p.cliente, file.name)
      const vend = (p.vendedor && acharVendedor('Vendedor: ' + p.vendedor, vendedores)) || acharVendedor(texto, vendedores)
      setF((s) => ({
        ...s,
        cliente_nome: s.cliente_nome || cliente || '',
        cliente_cpf: s.cliente_cpf || p.cpf || '',
        cliente_telefone: s.cliente_telefone || p.telefone || '',
        cliente_endereco: s.cliente_endereco || p.endereco || '',
        data_contrato: s.data_contrato || (p.data && p.data <= hojeSP() ? p.data : ''),
        valor: s.valor || (p.valor ?? ''),
        vendedor: s.vendedor || vend || '',
      }))
      const achou = [cliente && 'cliente', p.cpf && 'CPF', p.data && 'data', p.valor && 'valor', vend && 'vendedor'].filter(Boolean)
      setLendo(achou.length
        ? `Li do contrato: ${achou.join(', ')}.${ehImg ? ' A leitura por foto pode errar.' : ''} Confira tudo antes de criar.`
        : 'Contrato anexado, mas não consegui ler os dados. Preencha abaixo.')
    } catch (e) { setLendo(''); setErro(e.message) }
  }

  async function criar() {
    setErro('')
    if (!arquivo) { setErro('Anexe o contrato assinado.'); return }
    if (!f.cliente_nome.trim()) { setErro('Informe o nome do cliente.'); return }
    if (!f.data_contrato) { setErro('Informe a data do contrato.'); return }
    const [tipo, id] = vinculo.split(':')
    setSalvando(true)
    const { data, error } = await supabase.rpc('contrato_assinado_registrar', {
      p_dados: { ...f, valor: f.valor === '' ? null : String(f.valor), tipo_venda: tipoVenda || 'Normal', arquivo_nome: arquivo.nome },
      p_arquivo: arquivo.path,
      p_venda_id: tipo === 'venda' ? Number(id) : null,
      p_contrato: tipo === 'contrato' ? id : null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    if (tipo === 'nova') await registrarLog({ tabela: 'vendas', registroId: data.venda_id, acao: 'criacao', descricao: `Nova venda de ${f.cliente_nome} pelo contrato assinado (${data.numero})` })
    onCriado?.(data.registro, data)
  }

  const bloco = { border: '1px dashed var(--line)', borderRadius: 10, padding: 14, margin: '0 0 16px', background: 'var(--paper)' }
  return <div style={bloco}>
    <b>Subir o contrato assinado</b>
    <div className="sub" style={{ margin: '2px 0 10px' }}>O sistema lê os dados do contrato e cria de uma vez a venda, o contrato e a ficha do cliente. Se a venda já foi lançada, ele usa a mesma.</div>
    <label className={'btn ghost' + (lendo && !arquivo ? ' disabled' : '')} style={{ cursor: 'pointer' }}>
      {arquivo ? 'Trocar arquivo' : 'Escolher contrato (PDF ou foto)'}
      <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = '' }} />
    </label>
    {arquivo && <span className="faint" style={{ marginLeft: 8, fontSize: 12 }}>{arquivo.nome}</span>}
    {lendo && <div className="sub" role="status" style={{ marginTop: 8 }}>{lendo}</div>}
    {arquivo && <>
      <div className="grid cols-2" style={{ gap: 10, marginTop: 12 }}>
        <div className="field"><label>Cliente * (confira o nome)</label><input className="input" value={f.cliente_nome} onChange={(e) => set('cliente_nome', e.target.value)} /></div>
        <div className="field"><label>CPF / CNPJ</label><input className="input" value={f.cliente_cpf} onChange={(e) => set('cliente_cpf', e.target.value)} /></div>
        <div className="field"><label>Telefone</label><input className="input" value={f.cliente_telefone} onChange={(e) => set('cliente_telefone', e.target.value)} /></div>
        <div className="field"><label>Endereço</label><input className="input" value={f.cliente_endereco} onChange={(e) => set('cliente_endereco', e.target.value)} /></div>
        <div className="field"><label>Data do contrato *</label><input className="input" type="date" max={hojeSP()} value={f.data_contrato} onChange={(e) => set('data_contrato', e.target.value)} /></div>
        <div className="field"><label>Valor total do contrato</label><input className="input" type="number" step="0.01" min="0" value={f.valor} onChange={(e) => set('valor', e.target.value)} /></div>
        <div className="field"><label>Vendedor</label><input className="input" list="contrato-assinado-vendedores" value={f.vendedor} onChange={(e) => set('vendedor', e.target.value)} /><datalist id="contrato-assinado-vendedores">{vendedores.map((n) => <option key={n} value={n} />)}</datalist></div>
        <div className="field"><label>Forma de pagamento (como está no contrato)</label><input className="input" placeholder="Ex.: entrada Pix + saldo antes da entrega" value={f.forma_pagamento} onChange={(e) => set('forma_pagamento', e.target.value)} /></div>
      </div>
      <div className="field"><label>Esta venda</label>
        <select className="input" value={vinculo} onChange={(e) => { setVinculo(e.target.value); setEscolheu(true) }}>
          <option value="nova">É uma venda nova: lançar agora</option>
          {sug.contratos.map((c) => <option key={c.id} value={`contrato:${c.id}`} disabled={c.temFicha}>Contrato já no sistema: {c.numero} · {c.cliente_nome}{c.temFicha ? ' (já tem ficha)' : ''}</option>)}
          {sug.vendas.map((v) => <option key={v.id} value={`venda:${v.id}`}>Venda já lançada: {v.cliente_nome} · {fmtDate(v.data_venda)}{v.valor_vendido ? ' · ' + brl(v.valor_vendido) : ''}</option>)}
        </select>
        {vinculo !== 'nova' && <div className="sub" style={{ marginTop: 4 }}>Não cria outra venda: liga o contrato assinado à que já existe.</div>}
        {vinculo === 'nova' && (sug.contratos.length > 0 || sug.vendas.length > 0) && <div className="sub" style={{ marginTop: 4, color: 'var(--danger)' }}>Já existe venda ou contrato com esse nome. Confira para não lançar duas vezes.</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={criar} disabled={salvando || !!(lendo && !arquivo)}>{salvando ? 'Criando…' : 'Criar venda e ficha do cliente'}</button></div>
    </>}
    {erro && <div className="login-err" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
  </div>
}
