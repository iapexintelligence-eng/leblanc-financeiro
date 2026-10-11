import { useEffect, useState } from 'react'
import { supabase, authOn } from '../lib/supabase.js'
import { anexarJornada, abrirDocumento } from '../lib/jornada.js'
import { lerXmlRevisao, sha256Hex, CUSTOS_XML, NIVEL, RESULTADO_COR } from '../lib/xml.js'
import { brl, fmtDate } from '../lib/format.js'

// Respeita a codificação declarada no XML (o Promob pode exportar em ISO-8859-1).
function decodificar(buf) {
  const cab = new TextDecoder('ascii').decode(buf.slice(0, 200))
  const enc = (cab.match(/encoding=["']([\w-]+)["']/i) || [])[1] || 'utf-8'
  try { return new TextDecoder(enc).decode(buf) } catch { return new TextDecoder('utf-8').decode(buf) }
}
const valor = (v) => (v === null || v === undefined || v === '' ? '—' : brl(v))
const vazio = () => ({ fabrica: '', fonte_fabrica: '', kits: '', frete: '', montagem: '', taxas: '', outros: '', outros_descricao: '', receita: '', receita_motivo: '' })

// XML final corrigido, pré-análise e OK da Leia vinculado à versão (manual 11/10, seção 9).
export default function XmlFinalConferencia({ contratoId, eu, pessoas = [] }) {
  const [a, setA] = useState(null), [erro, setErro] = useState(''), [busy, setBusy] = useState(false), [aviso, setAviso] = useState('')
  const [custos, setCustos] = useState(vazio()), [obs, setObs] = useState(''), [motivoExcecao, setMotivoExcecao] = useState(''), [versoes, setVersoes] = useState([])
  const papel = eu?.papel
  const fin = papel === 'financeiro' || papel === 'gestor'
  const podeFinal = papel === 'correcao' || papel === 'gestor'
  const podeOriginal = ['vendedor', 'correcao', 'gestor', 'financeiro'].includes(papel)
  const nome = (id) => pessoas.find((p) => p.usuario_id === id)?.nome || 'Usuário registrado'

  async function carregar() {
    const r = await supabase.rpc('xml_analise', { p_contrato: contratoId })
    if (r.error) throw r.error
    setA(r.data)
    const c = r.data.custos || {}
    setCustos({ ...vazio(), ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) })
    const v = await supabase.from('xml_revisoes').select('id,tipo,versao,nome_arquivo,arquivo,total_tabela,leitura_erro,criado_em,criado_por').eq('contrato_id', contratoId).order('criado_em', { ascending: false })
    if (!v.error) setVersoes(v.data)
  }
  useEffect(() => { setA(null); setErro(''); if (authOn && contratoId) carregar().catch((e) => setErro(e.message)) }, [contratoId])

  async function executar(fn, ok) {
    setBusy(true); setErro(''); setAviso('')
    try { await fn(); await carregar(); if (ok) setAviso(ok) } catch (e) { setErro(e.message) } finally { setBusy(false) }
  }
  const registrar = (tipo, file) => file && executar(async () => {
    if (!/\.xml$/i.test(file.name)) throw new Error('Selecione o arquivo .xml exportado do Promob.')
    const buf = await file.arrayBuffer()
    const leitura = lerXmlRevisao(decodificar(buf))
    const conteudo_hash = await sha256Hex(buf)
    const arquivo = await anexarJornada(file)
    const r = await supabase.rpc('xml_registrar', { p_contrato: contratoId, p_tipo: tipo, p_dados: { arquivo, nome_arquivo: file.name, conteudo_hash, total_tabela: leitura.total, leitura_erro: leitura.erro, ambientes: leitura.ambientes, fornecedor: leitura.fornecedor } })
    if (r.error) throw r.error
  }, tipo === 'final' ? 'Nova versão do XML final registrada. Qualquer OK anterior deixa de valer.' : 'XML da venda registrado para comparação.')
  const salvarCustos = () => executar(async () => {
    const r = await supabase.rpc('xml_custos_salvar', { p_revisao: a.final.id, p_custos: custos, p_versao: a.custos_versao || 0 })
    if (r.error) throw r.error
  }, 'Custos salvos. Confira a pré-análise antes do OK.')
  const conferir = () => executar(async () => {
    const r = await supabase.rpc('xml_conferir', { p_revisao: a.final.id, p_hash: a.valores_hash, p_observacoes: obs })
    if (r.error) throw r.error
    setObs('')
  }, 'OK registrado para esta versão do XML e dos valores.')
  const autorizar = () => executar(async () => {
    const r = await supabase.rpc('xml_autorizar_excecao', { p_revisao: a.final.id, p_hash: a.valores_hash, p_motivo: motivoExcecao })
    if (r.error) throw r.error
    setMotivoExcecao('')
  }, 'Exceção autorizada para estes valores.')

  if (!authOn) return <section className="card"><h3>XML final e conferência da Leia</h3><p>Disponível com o banco conectado. Na demonstração nenhum arquivo é enviado.</p></section>
  if (!contratoId) return <p className="sub">Selecione o contrato para registrar o XML final.</p>
  if (erro && !a) return <div className="login-err" role="alert">{erro}</div>
  if (!a) return <p>Carregando conferência…</p>

  const prejuizo = a.motivos?.some((m) => m.texto?.startsWith('Prejuízo previsto'))
  const bloqueado = a.resultado === 'Bloqueado'
  return <section>
    {erro && <div className="login-err" role="alert">{erro}</div>}
    {aviso && <div className="card" role="status" style={{ marginBottom: 12 }}>{aviso}</div>}
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Pré-análise <span className={'badge ' + (RESULTADO_COR[a.resultado] || 'neutral')}>{a.resultado}</span> {a.ok_valido ? <span className="badge ok">OK da Leia válido</span> : <span className="badge neutral">Sem OK para esta versão</span>}</h3>
      <p className="sub">A implantação só é aceita pelo servidor com o XML final anexado e o OK financeiro da versão vigente. Trocar o XML, a receita ou os custos invalida o OK. A pré-análise não substitui a conferência da Leia.</p>
      {a.motivos?.length ? <ul style={{ paddingLeft: 18 }}>{a.motivos.map((m, i) => <li key={i} style={{ marginBottom: 6 }}>{NIVEL[m.nivel] ? <span className={'badge ' + NIVEL[m.nivel]}>{m.nivel === 'bloqueio' ? 'Bloqueio' : 'Conferir'}</span> : <span className="badge neutral">Aviso</span>} {m.texto}</li>)}</ul> : <p>Documentos e custos completos, sem divergências.</p>}
      {a.ok_valido && a.ok && <p>Conferido em {new Date(a.ok.em).toLocaleString('pt-BR')}{a.ok.por ? ` por ${nome(a.ok.por)}` : ''}{a.ok.observacoes ? ` · ${a.ok.observacoes}` : ''}</p>}
      {a.implantado && <p className="badge ok">Pedido implantado. Alterações posteriores seguem por aditivo.</p>}
    </div>

    <div className="grid cols-2" style={{ gap: 16, marginBottom: 16 }}>
      <div className="card">
        <h3>XML da venda</h3>
        <p>{a.original?.origem || 'Não registrado'} · Total de tabela: {valor(a.original?.total_tabela)}</p>
        {a.original?.arquivo && <button className="btn ghost sm" onClick={() => abrirDocumento(a.original.arquivo).catch((e) => setErro(e.message))}>Abrir XML da venda</button>}
        {podeOriginal && !a.implantado && <div className="field" style={{ marginTop: 12 }}><label>{a.original?.origem ? 'Registrar outra versão do XML da venda' : 'Anexar XML da venda para comparação'}</label><input aria-label="XML da venda" type="file" accept=".xml,application/xml,text/xml" disabled={busy} onChange={(e) => { registrar('original', e.target.files?.[0]); e.target.value = '' }} /></div>}
      </div>
      <div className="card">
        <h3>XML final corrigido</h3>
        {a.final ? <>
          <p>Versão {a.final.versao} · {a.final.nome_arquivo} · {fmtDate(a.final.criado_em)} · {nome(a.final.criado_por)}</p>
          <p>Total de tabela: {a.final.total_tabela == null ? <span className="badge danger">Leitura falhou: {a.final.leitura_erro}</span> : brl(a.final.total_tabela)}{a.final.fornecedor ? ` · ${a.final.fornecedor}` : ''}</p>
          <p className="sub">Identificador do conteúdo: {a.final.hash?.slice(0, 16)}…</p>
          <button className="btn ghost sm" onClick={() => abrirDocumento(a.final.arquivo).catch((e) => setErro(e.message))}>Abrir XML final</button>
        </> : <p>Obrigatório antes da implantação. Anexado por Giovanna ou pelo conferente responsável.</p>}
        {podeFinal && !a.implantado && <div className="field" style={{ marginTop: 12 }}><label>{a.final ? 'Substituir por nova versão (a atual é preservada)' : 'Anexar XML final corrigido do Promob'}</label><input aria-label="XML final corrigido" type="file" accept=".xml,application/xml,text/xml" disabled={busy} onChange={(e) => { registrar('final', e.target.files?.[0]); e.target.value = '' }} /></div>}
      </div>
    </div>

    {a.comparacao?.length > 0 && <div className="card" style={{ marginBottom: 16 }}><h3>Ambientes alterados</h3><p className="sub">Valores de tabela do Promob. Diferença indica alteração do projeto, não lucro.</p><div className="table-wrap"><table><thead><tr><th>Ambiente</th><th>Venda</th><th>Final</th></tr></thead><tbody>{a.comparacao.map((c) => <tr key={c.ambiente}><td>{c.ambiente || '(sem nome)'}</td><td>{c.venda == null ? 'Não consta' : brl(c.venda)}</td><td>{c.final == null ? 'Removido' : brl(c.final)}</td></tr>)}</tbody></table></div></div>}

    {fin && a.final && <div className="card" style={{ marginBottom: 16 }}>
      <h3>Custos e margem · Leia</h3>
      <p className="sub">Preço de tabela não é custo. Informe o custo real da fábrica e os demais custos desta venda, sem duplicar taxas. Use 0 quando não se aplicar; campo vazio fica como pendente.</p>
      <fieldset disabled={busy || a.implantado} style={{ border: 0, padding: 0 }}>
        <div className="row-2">{CUSTOS_XML.map(([k, label]) => <div className="field" key={k}><label>{label}</label><input aria-label={label} className="input" type="number" min="0" step="0.01" value={custos[k]} onChange={(e) => setCustos((c) => ({ ...c, [k]: e.target.value }))} /></div>)}</div>
        <div className="field"><label>Origem do custo da fábrica</label><input className="input" placeholder="Ex.: cobrança da indústria nº…" value={custos.fonte_fabrica} onChange={(e) => setCustos((c) => ({ ...c, fonte_fabrica: e.target.value }))} /></div>
        {Number(custos.outros) > 0 && <div className="field"><label>Descrição dos outros custos</label><input className="input" value={custos.outros_descricao} onChange={(e) => setCustos((c) => ({ ...c, outros_descricao: e.target.value }))} /></div>}
        <div className="row-2"><div className="field"><label>Receita considerada (deixe vazio para usar o contrato: {valor(a.receita_contrato)})</label><input className="input" type="number" min="0" step="0.01" value={custos.receita} onChange={(e) => setCustos((c) => ({ ...c, receita: e.target.value }))} /></div>
          <div className="field"><label>Justificativa da receita informada</label><input className="input" value={custos.receita_motivo} onChange={(e) => setCustos((c) => ({ ...c, receita_motivo: e.target.value }))} /></div></div>
        <button className="btn ghost" onClick={salvarCustos}>Salvar custos</button>
      </fieldset>
      <table style={{ marginTop: 16 }}><tbody>
        <tr><td>Receita considerada</td><td>{valor(a.receita)}</td></tr>
        <tr><td>Custo total informado</td><td>{valor(a.custo_total)}</td></tr>
        <tr><td>Margem prevista</td><td>{a.margem == null ? '—' : `${Number(a.margem).toLocaleString('pt-BR')}%`}</td></tr>
        <tr><td>Margem mínima configurada</td><td>{a.margem_minima == null ? 'Não configurada' : `${Number(a.margem_minima).toLocaleString('pt-BR')}%`}</td></tr>
      </tbody></table>
      {!a.implantado && !a.ok_valido && <div style={{ marginTop: 16 }}>
        <div className="field"><label>Observações da conferência</label><textarea className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        <button className="btn" disabled={busy || bloqueado} onClick={conferir}>Conferi os valores e a margem</button>
        {bloqueado && <p className="sub">Resolva os bloqueios antes do OK.</p>}
      </div>}
    </div>}

    {eu?.aprovadora && prejuizo && !a.implantado && <div className="card" style={{ marginBottom: 16 }}>
      <h3>Autorização de exceção por prejuízo</h3>
      <p className="sub">Vale somente para esta versão do XML e destes valores. A política formal e seus limites ainda devem ser definidos pela direção.</p>
      <div className="field"><label>Justificativa</label><textarea className="input" value={motivoExcecao} onChange={(e) => setMotivoExcecao(e.target.value)} /></div>
      <button className="btn danger" disabled={busy || !motivoExcecao.trim()} onClick={autorizar}>Autorizar como {eu.aprovadora}</button>
    </div>}

    {versoes.length > 0 && <details><summary>Histórico de versões dos XMLs</summary>{versoes.map((v) => <p key={v.id}>{v.tipo === 'final' ? 'Final' : 'Venda'} v{v.versao} · {v.nome_arquivo} · {v.total_tabela == null ? `leitura falhou (${v.leitura_erro})` : brl(v.total_tabela)} · {new Date(v.criado_em).toLocaleString('pt-BR')} · {nome(v.criado_por)} <button className="btn ghost sm" onClick={() => abrirDocumento(v.arquivo).catch((e) => setErro(e.message))}>Abrir</button></p>)}</details>}
  </section>
}
