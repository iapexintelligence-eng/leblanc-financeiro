import { Component } from 'react'

// Um dado com problema derruba só o trecho onde aparece, nunca a tela inteira.
export default class Protegido extends Component {
  constructor(props) { super(props); this.state = { erro: null } }
  static getDerivedStateFromError(erro) { return { erro } }
  componentDidCatch(erro, info) { console.error('[Protegido]', this.props.nome || '', erro, info?.componentStack) }
  componentDidUpdate(prev) { if (this.state.erro && prev.chave !== this.props.chave) this.setState({ erro: null }) }
  render() {
    if (!this.state.erro) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback
    return <div className="card" role="alert" style={{ borderColor: 'var(--danger)' }}>
      <b>Esta parte da tela não pôde ser exibida.</b>
      <p className="sub" style={{ margin: '6px 0 0' }}>{this.props.nome ? this.props.nome + ': ' : ''}{String(this.state.erro?.message || this.state.erro)}. O restante do sistema continua funcionando. Avise o suporte com esta mensagem.</p>
    </div>
  }
}
