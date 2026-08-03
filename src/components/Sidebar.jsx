import { NavLink } from 'react-router-dom'
import { podeTudo } from '../lib/useRole.js'
import {
  IcoHome, IcoSales, IcoProject, IcoReceive, IcoForecast, IcoCost,
  IcoPay, IcoDre, IcoBank, IcoGift, IcoTool, IcoPeople, IcoReport,
} from './Icons.jsx'

// roles = papéis que veem o item (além de administrativo/diretoria, que veem tudo).
// sem roles = só administrativo/diretoria.
const GROUPS = [
  { label: 'Início', items: [ { to: '/', icon: IcoHome, txt: 'Visão Geral', end: true } ] },
  { label: 'Operação', items: [
    { to: '/vendas', icon: IcoSales, txt: 'Vendas' },
    { to: '/contratos', icon: IcoReport, txt: 'Contratos (emitir)', roles: ['vendedor'] },
    { to: '/simulador', icon: IcoCost, txt: 'Simulador de pagamento', roles: ['vendedor'] },
    { to: '/acompanhamento', icon: IcoForecast, txt: 'Acompanhamento', roles: ['vendedor'] },
    { to: '/novo-contrato', icon: IcoReport, txt: 'Novo Contrato' },
    { to: '/projetos', icon: IcoProject, txt: 'Projetos' },
    { to: '/recebiveis', icon: IcoReceive, txt: 'Recebíveis' },
    { to: '/previsibilidade', icon: IcoForecast, txt: 'Previsibilidade' },
  ]},
  { label: 'Fluxo (setores)', items: [
    { to: '/correcao', icon: IcoTool, txt: 'Correção', roles: ['correcao'] },
    { to: '/liberacao', icon: IcoPay, txt: 'Liberação / Indústria' },
    { to: '/montagem', icon: IcoTool, txt: 'Montagem', roles: ['montagem'] },
    { to: '/qualidade', icon: IcoTool, txt: 'Qualidade', roles: ['qualidade'] },
    { to: '/agenda', icon: IcoProject, txt: 'Agenda da loja', roles: ['correcao', 'montagem'] },
  ]},
  { label: 'Financeiro', items: [
    { to: '/custos', icon: IcoCost, txt: 'Custos Operacionais' },
    { to: '/pagamentos', icon: IcoPay, txt: 'Pagamentos' },
    { to: '/saidas', icon: IcoPay, txt: 'Saídas' },
    { to: '/contas-fixas', icon: IcoPay, txt: 'Contas Fixas Mensais' },
    { to: '/vincular', icon: IcoProject, txt: 'Vincular gastos a contratos' },
    { to: '/dre', icon: IcoDre, txt: 'DRE Mensal' },
    { to: '/bancos', icon: IcoBank, txt: 'Bancos' },
    { to: '/pro-labore', icon: IcoPay, txt: 'Pró-labore' },
    { to: '/faturas-cartao', icon: IcoBank, txt: 'Faturas de cartão' },
    { to: '/gratificacao', icon: IcoGift, txt: 'Gratificação' },
  ]},
  { label: 'Pós-venda & Cadastros', items: [
    { to: '/assistencias', icon: IcoTool, txt: 'Assistências', roles: ['qualidade'] },
    { to: '/aot', icon: IcoTool, txt: 'AOT (Assist. Técnica)', roles: ['qualidade', 'montagem'] },
    { to: '/funcionarios', icon: IcoPeople, txt: 'Funcionários' },
    { to: '/usuarios', icon: IcoPeople, txt: 'Usuários & Acessos' },
    { to: '/relatorios', icon: IcoReport, txt: 'Relatórios' },
  ]},
]

export default function Sidebar({ papel = 'administrativo' }) {
  const vePode = (it) => podeTudo(papel) || (it.roles && it.roles.includes(papel))
  const grupos = GROUPS.map((g) => ({ ...g, items: g.items.filter(vePode) })).filter((g) => g.items.length)
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>Le Blanc</h1>
        <span>Financeiro · Painel</span>
      </div>
      {grupos.map((g) => (
        <div className="nav-group" key={g.label}>
          <div className="label">{g.label}</div>
          {g.items.map((it) => {
            const Icon = it.icon
            return (
              <NavLink key={it.to} to={it.to} end={it.end}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                <Icon /> {it.txt}
              </NavLink>
            )
          })}
        </div>
      ))}
    </aside>
  )
}
