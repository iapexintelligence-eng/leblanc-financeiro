import { prazoEspecial, textoPrazoEspecial } from '../lib/prazoEspecial.js'

export default function SeloPrazoEspecial({ dados, style }) {
  const p = prazoEspecial(dados)
  if (!p) return null
  return <span className="badge especial" title={p.motivo || 'Prazo especial combinado com o cliente'} style={style}>{textoPrazoEspecial(p)}</span>
}
