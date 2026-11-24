import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Vendas from './Vendas.jsx'
import ContratosImportados from './ContratosImportados.jsx'
import ContratoAssinado from '../components/ContratoAssinado.jsx'
import ParcelasContrato from '../components/ParcelasContrato.jsx'
import { parcelasDoCliente, projetoDoContrato } from '../lib/recebimentos.js'
import { brl } from '../lib/format.js'
import { supabase, authOn } from '../lib/supabase.js'
import { todas } from '../lib/jornada.js'

// Um lugar só para a Leia: o que o comercial lançou (vendas com o PDF do contrato) e os lotes que
// a gestão importou (contratos históricos com documentos e aditivos). Aqui ela também sobe um
// contrato à mão, inclusive os antigos.
const ABAS = [['comercial', 'Lançados pelo comercial'], ['importados', 'Importados por nós']]

export default function ContratosTodos() {
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(([k]) => k === params.get('aba')) ? params.get('aba') : 'comercial'
  const [subindo, setSubindo] = useState(false)
  const [contratos, setContratos] = useState([]), [comFicha, setComFicha] = useState(new Set())
  const [feito, setFeito] = useState(null), [versao, setVersao] = useState(0)
  const [semParcelas, setSemParcelas] = useState([]), [parcelasDe, setParcelasDe] = useState(null), [aviso, setAviso] = useState('')

  // Contratos subidos à mão que ainda não têm o que o cliente vai pagar em Entradas.
  async function carregarSemParcelas() {
    const [cs, ar] = await Promise.all([
      todas(() => supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome,valor_final,origem:dados_json->importacao->>origem').in('dados_json->importacao->>origem', ['contrato_antigo', 'contrato_assinado']).order('id')),
      todas(() => supabase.from('a_receber').select('id,cliente_nome,projeto_uid').order('id')),
    ])
    setSemParcelas(cs.filter((c) => !parcelasDoCliente(ar, { nome: c.cliente_nome, projeto: projetoDoContrato(c.numero) }).length))
  }
  useEffect(() => { if (authOn) carregarSemParcelas().catch(() => {}) }, [versao])

  async function carregarContratos() {
    const [cs, fichas] = await Promise.all([
      todas(() => supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome,vendor,venda_id:dados_json->>venda_id').order('id')),
      todas(() => supabase.from('jornada_registros').select('contrato_id').eq('tipo', 'pedido')),
    ])
    setContratos(cs)
    setComFicha(new Set(fichas.map((r) => String(r.contrato_id))))
  }
  useEffect(() => { if (subindo && authOn) carregarContratos().catch(() => {}) }, [subindo])

  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3>Contratos</h3>
          <p className="sub" style={{ margin: '4px 0 12px' }}>Todos os contratos da loja num lugar só. Os emitidos pelo sistema ficam em <Link to="/orcamentos">Orçamentos e contratos</Link>.</p>
        </div>
        {authOn && <button className={'btn' + (subindo ? ' ghost' : '')} type="button" onClick={() => { setSubindo((s) => !s); setFeito(null) }}>{subindo ? 'Fechar' : 'Subir contrato'}</button>}
      </div>
      {subindo && <>
        {feito && <div className="sub" role="status" style={{ margin: '0 0 12px', color: 'var(--ok)' }}>
          Contrato {feito.numero} guardado{feito.registro ? <>, com ficha na jornada: <Link to={'/jornada?registro=' + encodeURIComponent(feito.registro.id)}>abrir ficha</Link></> : ''}. Pode subir o próximo.
        </div>}
        <ContratoAssinado key={versao} modo="contratos" contratos={contratos} comFicha={comFicha} tipoVenda="Normal"
          onCriado={async (_reg, data) => { setFeito(data); setVersao((v) => v + 1); setParcelasDe(data.contrato_id); await carregarContratos() }} />
      </>}
      {semParcelas.length > 0 && <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, margin: '0 0 12px' }}>
        <b>Contratos subidos que ainda não estão em Entradas</b>
        <div className="sub" style={{ margin: '2px 0 8px' }}>Lance o que cada cliente vai pagar para ele aparecer em Entradas → Recebimentos e dar para dar baixa.</div>
        {semParcelas.map((c) => <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', flexWrap: 'wrap' }}>
          <span><b>{c.cliente_nome}</b> <span className="faint">· {c.numero}{Number(c.valor_final) > 0 ? ' · ' + brl(c.valor_final) : ''}</span></span>
          <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => setParcelasDe(c.id)}>Lançar parcelas</button>
        </div>)}
      </div>}
      {aviso && <div className="sub" role="status" style={{ margin: '0 0 12px', color: 'var(--ok)' }}>{aviso}</div>}
      {parcelasDe && <ParcelasContrato contratoId={parcelasDe} onClose={() => setParcelasDe(null)}
        onFeito={(n) => { setParcelasDe(null); setAviso(`${n} parcela(s) lançadas em Entradas. Para dar baixa no que o cliente já pagou, abra Entradas → Recebimentos e clique em Receber.`); carregarSemParcelas().catch(() => {}) }} />}
      <div className="tools">{ABAS.map(([k, t]) => <button key={k} className={'btn ' + (aba === k ? '' : 'ghost')} aria-pressed={aba === k} onClick={() => setParams({ aba: k }, { replace: true })}>{t}</button>)}</div>
    </div>
    {aba === 'comercial' ? <Vendas key={versao} /> : <ContratosImportados key={versao} />}
  </>
}
