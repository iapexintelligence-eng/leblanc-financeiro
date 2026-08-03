import { Routes, Route } from 'react-router-dom'
import { useAuth } from './lib/useAuth.js'
import Login from './pages/Login.jsx'
import Layout from './components/Layout.jsx'

import Home from './pages/Home.jsx'
import Vendas from './pages/Vendas.jsx'
import Recebiveis from './pages/Recebiveis.jsx'
import Bancos from './pages/Bancos.jsx'
import Funcionarios from './pages/Funcionarios.jsx'
import Usuarios from './pages/Usuarios.jsx'
import NovoContrato from './pages/NovoContrato.jsx'
import EmitirContrato from './pages/EmitirContrato.jsx'
import Simulador from './pages/Simulador.jsx'
import Correcao from './pages/Correcao.jsx'
import Acompanhamento from './pages/Acompanhamento.jsx'
import Agenda from './pages/Agenda.jsx'
import Liberacao from './pages/Liberacao.jsx'
import Montagem from './pages/Montagem.jsx'
import Qualidade from './pages/Qualidade.jsx'
import Custos from './pages/Custos.jsx'
import Pagamentos from './pages/Pagamentos.jsx'
import DRE from './pages/DRE.jsx'
import Previsibilidade from './pages/Previsibilidade.jsx'
import Assistencias from './pages/Assistencias.jsx'
import Gratificacao from './pages/Gratificacao.jsx'
import Relatorios from './pages/Relatorios.jsx'
import Projetos from './pages/Projetos.jsx'
import EmBreve from './pages/EmBreve.jsx'

export default function App() {
  const { session, loading, authOn } = useAuth()

  if (loading) return <div className="spinner-wrap">Carregando…</div>
  if (authOn && !session) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/novo-contrato" element={<NovoContrato />} />
        <Route path="/contratos" element={<EmitirContrato />} />
        <Route path="/simulador" element={<Simulador />} />
        <Route path="/correcao" element={<Correcao />} />
        <Route path="/acompanhamento" element={<Acompanhamento />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/liberacao" element={<Liberacao />} />
        <Route path="/montagem" element={<Montagem />} />
        <Route path="/qualidade" element={<Qualidade />} />
        <Route path="/recebiveis" element={<Recebiveis />} />
        <Route path="/bancos" element={<Bancos />} />
        <Route path="/funcionarios" element={<Funcionarios />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/custos" element={<Custos />} />
        <Route path="/pagamentos" element={<Pagamentos />} />
        <Route path="/dre" element={<DRE />} />
        <Route path="/previsibilidade" element={<Previsibilidade />} />
        <Route path="/assistencias" element={<Assistencias />} />
        <Route path="/gratificacao" element={<Gratificacao />} />
        <Route path="/projetos" element={<Projetos />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="*" element={<EmBreve titulo="Página" />} />
      </Route>
    </Routes>
  )
}
