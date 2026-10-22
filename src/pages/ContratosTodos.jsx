import { useSearchParams, Link } from 'react-router-dom'
import Vendas from './Vendas.jsx'
import ContratosImportados from './ContratosImportados.jsx'

// Um lugar só para a Leia: o que o comercial lançou (vendas com o PDF do contrato) e os lotes que
// a gestão importou (contratos históricos com documentos e aditivos).
const ABAS = [['comercial', 'Lançados pelo comercial'], ['importados', 'Importados por nós']]

export default function ContratosTodos() {
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(([k]) => k === params.get('aba')) ? params.get('aba') : 'comercial'
  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Contratos</h3>
      <p className="sub" style={{ margin: '4px 0 12px' }}>Todos os contratos da loja num lugar só. Os emitidos pelo sistema ficam em <Link to="/orcamentos">Orçamentos e contratos</Link>.</p>
      <div className="tools">{ABAS.map(([k, t]) => <button key={k} className={'btn ' + (aba === k ? '' : 'ghost')} aria-pressed={aba === k} onClick={() => setParams({ aba: k }, { replace: true })}>{t}</button>)}</div>
    </div>
    {aba === 'comercial' ? <Vendas /> : <ContratosImportados />}
  </>
}
