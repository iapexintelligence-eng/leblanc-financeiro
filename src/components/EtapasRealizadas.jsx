import { useState } from 'react'
import { supabase, authOn } from '../lib/supabase.js'
import { fmtDate } from '../lib/format.js'
import { hojeSP } from '../lib/prazos.js'

// Etapas que já aconteceram antes do sistema, nas fichas trazidas da planilha de revisões.
export const ETAPAS_HISTORICAS = [
  ['liberacao_em', 'Liberação para medição', ['gestor', 'financeiro', 'correcao'], 'lib_medida'],
  ['medicao_em', 'Medição realizada', ['gestor', 'correcao'], 'medida'],
  ['correcao_em', 'Conferência e guias concluídas', ['gestor', 'correcao'], null],
  ['aprovacao_em', 'Projeto aprovado / assinado pelo cliente', ['gestor', 'correcao'], 'assinatura'],
  ['implantacao_em', 'Pedido implantado na fábrica', ['gestor', 'correcao'], null],
  ['cliente_recebe_em', 'Cliente confirmou que pode receber', ['gestor', 'logistica'], null],
  ['entrega_em', 'Entrega realizada', ['gestor', 'logistica'], null],
  ['montagem_concluida_em', 'Montagem concluída', ['gestor', 'logistica'], null],
]

export default function EtapasRealizadas({ registro, eu, pessoas, onSalvo }) {
  const d = registro.dados
  const imp = d.importacao_revisoes
  const papel = eu?.papel
  const [datas, setDatas] = useState(() => Object.fromEntries(ETAPAS_HISTORICAS.filter(([k, , , orig]) => !d[k] && orig && imp?.[orig]).map(([k, , , orig]) => [k, imp[orig]])))
  const [justificativa, setJustificativa] = useState(imp ? `Conforme planilha ${imp.arquivo || 'CONTROLE DE REVISÕES 2026'} (aba ${imp.aba || '—'}, linha ${imp.linha || '—'})` : '')
  const [pedidoFabrica, setPedidoFabrica] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const historico = d.historico || {}
  const abertas = ETAPAS_HISTORICAS.filter(([k]) => !d[k])
  const podeAlguma = authOn && abertas.some(([, , papeis]) => papeis.includes(papel))
  const nome = (id) => pessoas?.find((p) => p.usuario_id === id)?.nome || 'Usuário'
  const preenchidas = Object.fromEntries(Object.entries(datas).filter(([k, v]) => v && !d[k] && ETAPAS_HISTORICAS.find(([e]) => e === k)?.[2].includes(papel)))

  async function registrar() {
    setSalvando(true); setErro('')
    try {
      const { data, error } = await supabase.rpc('jornada_registrar_historico', {
        p_id: registro.id, p_versao: registro.versao, p_marcos: preenchidas, p_justificativa: justificativa,
        p_pedido_fabrica: pedidoFabrica || null,
      })
      if (error) throw error
      setDatas({})
      onSalvo?.(Array.isArray(data) ? data[0] : data)
    } catch (e) { setErro(e.message) } finally { setSalvando(false) }
  }

  if (!imp) return null
  return <div className="card" style={{ margin: '12px 0' }}>
    <h3>Etapas que já aconteceram</h3>
    <p className="sub">Para clientes que vieram da planilha: registre a data real de cada etapa já feita, em ordem. Não pede o checklist inicial nem os comprovantes do fluxo novo, mas fica gravado quem registrou e de onde veio a informação. A partir daí a ficha segue o fluxo normal do sistema, e as pendências da planilha deixam de aparecer. Se ainda houver assistência aberta, registre-a em Assistências.</p>
    {Object.keys(historico).length > 0 && <table style={{ marginBottom: 12 }}><thead><tr><th>Etapa</th><th>Data</th><th>Registrado por</th><th>Origem</th></tr></thead><tbody>
      {ETAPAS_HISTORICAS.filter(([k]) => historico[k]).map(([k, label]) => <tr key={k}><td>{label}</td><td>{fmtDate(historico[k].data)}</td><td>{nome(historico[k].por)} · {fmtDate(String(historico[k].registrado_em || '').slice(0, 10))}</td><td>{historico[k].justificativa}</td></tr>)}
    </tbody></table>}
    {!podeAlguma ? <p className="sub">{abertas.length ? 'As etapas restantes são registradas pelo setor responsável (conferente, logística ou gestão).' : 'Todas as etapas já estão registradas.'}</p> : <>
      {erro && <div className="login-err" role="alert">{erro}</div>}
      <div className="grid cols-2">
        {abertas.map(([k, label, papeis, orig]) => {
          const pode = papeis.includes(papel)
          return <div className="field" key={k}><label>{label}{orig && imp[orig] ? ` · planilha: ${fmtDate(imp[orig])}` : ''}</label>
            <input className="input" type="date" max={hojeSP()} disabled={!pode} value={datas[k] || ''} onChange={(e) => setDatas((x) => ({ ...x, [k]: e.target.value }))} />
            {!pode && <small className="sub">Registrado pelo setor responsável</small>}
          </div>
        })}
      </div>
      {preenchidas.implantacao_em && !d.pedido_fabrica && <div className="field"><label>Número do pedido na fábrica (se souber)</label><input className="input" value={pedidoFabrica} onChange={(e) => setPedidoFabrica(e.target.value)} /></div>}
      <div className="field"><label>De onde vem a informação</label><textarea className="input" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} /></div>
      <button className="btn" disabled={salvando || !Object.keys(preenchidas).length || justificativa.trim().length < 10} onClick={registrar}>{salvando ? 'Registrando…' : `Registrar ${Object.keys(preenchidas).length} etapa(s)`}</button>
      <p className="sub">Deixe em branco o que ainda não aconteceu. Implantação feita depois da importação segue o fluxo normal, com XML final e OK da Leia.</p>
    </>}
  </div>
}
