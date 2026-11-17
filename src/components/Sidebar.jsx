import { NavLink, useLocation } from 'react-router-dom'
import {
  IcoHome, IcoSales, IcoProject, IcoReceive, IcoForecast, IcoCost,
  IcoPay, IcoDre, IcoBank, IcoGift, IcoTool, IcoPeople, IcoReport,
} from './Icons.jsx'
import { casa } from '../lib/menu.js'

// O menu (telas, acessos e áreas) mora em lib/menu.js; aqui só desenha.
export { AREA_INICIAL, INICIO, areaDaRota, areasVisiveis, itemDaArea, abaAtual, podeVerRota } from '../lib/menu.js'

const ICONES = {
  home: IcoHome, sales: IcoSales, project: IcoProject, receive: IcoReceive, forecast: IcoForecast, cost: IcoCost,
  pay: IcoPay, dre: IcoDre, bank: IcoBank, gift: IcoGift, tool: IcoTool, people: IcoPeople, report: IcoReport,
}

export default function Sidebar({ area }) {
  const { pathname } = useLocation()
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>Le Blanc</h1>
        <span>Gestão integrada</span>
      </div>
      {area && <div className="area-nome">{area.label}<small>{area.quem}</small></div>}
      {(area?.grupos || []).map((g) => (
        <div className="nav-group" key={g.label}>
          <div className="label">{g.label}</div>
          {g.itens.map((it) => {
            const Icon = ICONES[it.icon] || IcoProject
            // Item com abas fica marcado em qualquer uma das telas dele.
            const ativo = it.abas ? casa(it, pathname) : null
            return (
              <NavLink key={it.txt + it.to} to={it.to} end={it.end}
                className={({ isActive }) => 'nav-item' + ((ativo ?? isActive) ? ' active' : '')}>
                <Icon /> {it.txt}
              </NavLink>
            )
          })}
        </div>
      ))}
    </aside>
  )
}
