import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { anexarJornada } from '../lib/jornada.js'
import { extrairTexto } from '../lib/pdfLer.js'
import { parseContrato, escolherNome } from '../lib/lerContrato.js'
import { ocrImagemAuto } from '../lib/ocr.js'
import { lerContratoIA, juntarLeituras } from '../lib/lerContratoIA.js'
import { acharVendedor, sugerirVinculo } from '../lib/contratoAssinado.js'
import { registrarLog } from '../lib/log.js'
import { brl, fmtDate } from '../lib/format.js'
import { hojeSP } from '../lib/prazos.js'

// "Novo registro" a partir do contrato assinado: sobe o PDF (ou foto), lê cliente, CPF, data, valor e
// vendedor, e cria de uma vez a venda, o contrato no sistema e a ficha do cliente.
// modo="contratos" (tela de Contratos da Léia): serve também para contrato antigo, que guarda venda e
// contrato sem abrir ficha, ou só anexa o PDF a um contrato que já está no sistema.
const VAZIO = { cliente_nome: '', cliente_cpf: '', cliente_telefone: '', cliente_endereco: '', data_contrato: '', valor: '', vendedor: '', forma_pagamento: '' }

export default function ContratoAssinado({ contratos, comFicha, tipoVenda, onCriado, modo = 'jornada' }) {
  const telaContratos = modo === 'contratos'
  // Na jornada sempre abre a ficha; na tela de Contratos a Léia escolhe (padrão: contrato antigo, sem ficha).
  const [abrirFicha, setAbrirFicha] = useState(!telaContratos)
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

  const sug = useMemo(() => sugerirVinculo({ cliente: f.cliente_nome, data: f.data_contrato, contratos, comFicha, vendas, permitirComFicha: telaContratos }), [f.cliente_nome, f.data_contrato, contratos, comFicha, vendas, telaContratos])
  const contratoEscolhido = vinculo.startsWith('contrato:') ? sug.contratos.find((c) => `contrato:${c.id}` === vinculo) : null
  // Contrato que já tem ficha: só anexa o PDF (não abre outra ficha).
  const abre = abrirFicha && !contratoEscolhido?.temFicha
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
      let texto = '', ia = null
      // Foto: leitura por IA (bem melhor que o OCR para foto de celular); o OCR fica de reserva.
      // PDF: lê o texto; se for escaneado (sem texto) ou não achar o cliente, chama a IA também.
      try {
        if (ehPdf) {
          setLendo('Lendo o contrato…'); texto = await extrairTexto(file)
          if (texto.replace(/\s/g, '').length < 200 || !parseContrato(texto).cliente) { setLendo('Lendo o contrato com IA…'); ia = await lerContratoIA(file).catch(() => null) }
        } else {
          setLendo('Lendo a foto do contrato com IA… (alguns segundos)')
          ia = await lerContratoIA(file).catch(() => null)
          if (!ia?.cliente) texto = (await ocrImagemAuto(file, { onProgress: (p) => setLendo(`Lendo a foto do contrato… ${p}%`) })).join(' ')
        }
      } catch (_) { /* segue com o que tiver */ }
      const path = await envio
      setArquivo({ path, nome: file.name })
      const p = juntarLeituras(ia, parseContrato(texto))
      // Nome lido no texto; se não houver, o do arquivo ("CONTRATO_LE_BLANC_Fulano_de_Tal.pdf").
      const cliente = ia?.cliente || escolherNome(p.cliente, file.name)
      const vend = (p.vendedor && acharVendedor('Vendedor: ' + p.vendedor, vendedores)) || acharVendedor(texto, vendedores) || ia?.vendedor || ''
      setF((s) => ({
        ...s,
        cliente_nome: s.cliente_nome || cliente || '',
        cliente_cpf: s.cliente_cpf || p.cpf || '',
        cliente_telefone: s.cliente_telefone || p.telefone || '',
        cliente_endereco: s.cliente_endereco || p.endereco || '',
        data_contrato: s.data_contrato || (p.data && p.data <= hojeSP() ? p.data : ''),
        valor: s.valor || (p.valor ?? ''),
        vendedor: s.vendedor || vend || '',
        forma_pagamento: s.forma_pagamento || p.forma_pagamento || '',
      }))
      const achou = [cliente && 'cliente', p.cpf && 'CPF', p.telefone && 'telefone', p.endereco && 'endereço', p.data && 'data', p.valor && 'valor', vend && 'vendedor', p.forma_pagamento && 'forma de pagamento'].filter(Boolean)
      const aviso = ia ? (ia.legivel ? ' Lido por IA: confira.' : ' A foto está difícil de ler: confira com atenção.') : ehImg ? ' A leitura por foto pode errar.' : ''
      setLendo(achou.length
        ? `Li do contrato: ${achou.join(', ')}.${aviso} Confira tudo antes de criar.`
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
      p_abrir_ficha: abre,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    if (tipo === 'nova') await registrarLog({ tabela: 'vendas', registroId: data.venda_id, acao: 'criacao', descricao: `Nova venda de ${f.cliente_nome} pelo ${abre ? 'contrato assinado' : 'upload de contrato antigo'} (${data.numero})` })
    onCriado?.(data.registro, data)
  }

  const bloco = { border: '1px dashed var(--line)', borderRadius: 10, padding: 14, margin: '0 0 16px', background: 'var(--paper)' }
  return <div style={bloco}>
    <b>{telaContratos ? 'Subir contrato' : 'Subir o contrato assinado'}</b>
    <div className="sub" style={{ margin: '2px 0 10px' }}>{telaContratos
      ? 'Serve também para contratos antigos. O sistema lê os dados do PDF e guarda a venda e o contrato. Se a venda ou o contrato já estão no sistema, ele usa os mesmos e só anexa o PDF.'
      : 'O sistema lê os dados do contrato e cria de uma vez a venda, o contrato e a ficha do cliente. Se a venda já foi lançada, ele usa a mesma.'}</div>
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
          {sug.contratos.map((c) => <option key={c.id} value={`contrato:${c.id}`} disabled={c.temFicha && !telaContratos}>Contrato já no sistema: {c.numero} · {c.cliente_nome}{c.temFicha ? (telaContratos ? ' (já tem ficha: só anexa o PDF)' : ' (já tem ficha)') : ''}</option>)}
          {sug.vendas.map((v) => <option key={v.id} value={`venda:${v.id}`}>Venda já lançada: {v.cliente_nome} · {fmtDate(v.data_venda)}{v.valor_vendido ? ' · ' + brl(v.valor_vendido) : ''}</option>)}
        </select>
        {vinculo !== 'nova' && <div className="sub" style={{ marginTop: 4 }}>Não cria outra venda: liga o contrato assinado à que já existe.</div>}
        {vinculo === 'nova' && (sug.contratos.length > 0 || sug.vendas.length > 0) && <div className="sub" style={{ marginTop: 4, color: 'var(--danger)' }}>Já existe venda ou contrato com esse nome. Confira para não lançar duas vezes.</div>}
      </div>
      {telaContratos && <div className="field"><label>Este cliente</label>
        <select className="input" value={abrirFicha ? 'andamento' : 'antigo'} onChange={(e) => setAbrirFicha(e.target.value === 'andamento')} disabled={!!contratoEscolhido?.temFicha}>
          <option value="antigo">Contrato antigo, já entregue: só guardar venda e contrato</option>
          <option value="andamento">Ainda em andamento: abrir também a ficha na jornada</option>
        </select>
        <div className="sub" style={{ marginTop: 4 }}>{contratoEscolhido?.temFicha ? 'Esse contrato já tem ficha na jornada: o PDF entra nela.' : vinculo === 'nova' ? 'A venda entra no mês da data do contrato.' : ''}</div>
      </div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={criar} disabled={salvando || !!(lendo && !arquivo)}>{salvando ? 'Salvando…' : telaContratos ? (vinculo === 'nova' ? 'Salvar venda e contrato' : 'Salvar contrato') : 'Criar venda e ficha do cliente'}</button></div>
    </>}
    {erro && <div className="login-err" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
  </div>
}
