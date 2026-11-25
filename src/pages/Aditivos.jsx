import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, authOn } from '../lib/supabase.js'
import { todas } from '../lib/jornada.js'
import { brl, fmtDate } from '../lib/format.js'
import AditivosContrato from '../components/AditivosContrato.jsx'
import { IcoSearch } from '../components/Icons.jsx'

// Aditivos (adendos) de qualquer contrato: a Léia procura o contrato pelo cliente ou pelo número,
// vê o contrato original e os aditivos que já existem, e anexa o novo assinado junto dele.
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ehAditivo = (a) => /aditivo|adendo/i.test(a.tipo || '')
const ehContrato = (a) => !ehAditivo(a)

export default function Aditivos() {
  const [contratos, setContratos] = useState(null), [anexos, setAnexos] = useState([]), [aditivos, setAditivos] = useState([])
  const [params] = useSearchParams()
  const [busca, setBusca] = useState(''), [sel, setSel] = useState(params.get('contrato') || null), [erro, setErro] = useState(''), [versao, setVersao] = useState(0)
  useEffect(() => { if (params.get('contrato')) setSel(params.get('contrato')) }, [params])

  async function carregar() {
    if (!authOn) { setContratos([]); return }
    try {
      const [cs, an, ad] = await Promise.all([
        todas(() => supabase.schema('leblanc').from('contratos').select('id,numero,cliente_nome,vendor,valor_final,created_at,data_contrato:dados_json->>data_contrato').order('id')),
        todas(() => supabase.schema('leblanc').from('contrato_anexos').select('id,contrato_id,bucket,path,tipo,nome_arquivo').order('id')),
        todas(() => supabase.from('contrato_aditivos').select('id,contrato_id,numero,data_assinatura,descricao,criado_em').order('criado_em', { ascending: false })),
      ])
      setContratos(cs); setAnexos(an); setAditivos(ad)
    } catch (e) { setErro(e.message); setContratos([]) }
  }
  useEffect(() => { carregar() }, [versao])

  const qtd = useMemo(() => {
    const m = {}
    for (const a of anexos) if (ehAditivo(a)) m[a.contrato_id] = (m[a.contrato_id] || 0) + 1
    for (const a of aditivos) m[a.contrato_id] = (m[a.contrato_id] || 0) + 1
    return m
  }, [anexos, aditivos])
  const lista = useMemo(() => {
    const q = semAcento(busca.trim())
    return (contratos || []).filter((c) => !q || semAcento(c.cliente_nome).includes(q) || semAcento(c.numero).includes(q))
      .sort((a, b) => String(b.data_contrato || b.created_at || '').localeCompare(String(a.data_contrato || a.created_at || '')))
  }, [contratos, busca])
  const contrato = (contratos || []).find((c) => c.id === sel)
  const docs = anexos.filter((a) => a.contrato_id === sel)
  const recentes = aditivos.slice(0, 8).map((a) => ({ ...a, c: (contratos || []).find((c) => c.id === a.contrato_id) }))

  async function abrir(a) {
    try { const r = await supabase.storage.from(a.bucket).createSignedUrl(a.path, 60); if (r.error) throw r.error; window.open(r.data.signedUrl, '_blank', 'noopener,noreferrer') } catch (e) { setErro(e.message) }
  }

  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Aditivos de contrato</h3>
      <p className="sub">Procure o contrato pelo nome do cliente ou pelo número e anexe o aditivo assinado. Ele fica guardado junto do contrato original, numerado, com a data da assinatura e o motivo. Anexar não muda valores, parcelas nem prazos: se o aditivo muda o financeiro, ajuste também em Entradas.</p>
      <div className="search" style={{ maxWidth: 460, marginTop: 10 }}><IcoSearch /><input className="input" placeholder="Buscar cliente ou número do contrato" value={busca} onChange={(e) => { setBusca(e.target.value); setSel(null) }} aria-label="Buscar contrato" /></div>
      {erro && <div className="login-err" role="alert" style={{ marginTop: 10 }}>{erro}</div>}
    </div>

    {!sel && <div className="table-wrap" style={{ marginBottom: 16, overflowX: 'auto' }}>
      <table>
        <thead><tr><th>Cliente</th><th>Contrato</th><th>Data</th><th>Vendedor</th><th className="num">Valor</th><th className="num">Aditivos</th><th></th></tr></thead>
        <tbody>
          {contratos === null && <tr><td colSpan="7" className="empty">Carregando…</td></tr>}
          {contratos && !lista.length && <tr><td colSpan="7" className="empty">{authOn ? 'Nenhum contrato com esse nome ou número. Se ele ainda não está no sistema, suba primeiro em Clientes → Contratos → Subir contrato.' : 'Entre no sistema para ver os contratos.'}</td></tr>}
          {lista.slice(0, busca ? 60 : 20).map((c) => <tr key={c.id}>
            <td><b>{c.cliente_nome}</b></td>
            <td className="muted">{c.numero}</td>
            <td className="muted">{fmtDate(c.data_contrato || String(c.created_at || '').slice(0, 10))}</td>
            <td className="muted">{c.vendor || '—'}</td>
            <td className="num">{Number(c.valor_final) > 0 ? brl(c.valor_final) : '—'}</td>
            <td className="num">{qtd[c.id] ? <span className="badge">{qtd[c.id]}</span> : <span className="faint">—</span>}</td>
            <td className="right"><button className="btn sm" type="button" onClick={() => setSel(c.id)}>Abrir</button></td>
          </tr>)}
        </tbody>
      </table>
      {contratos && !busca && lista.length > 20 && <div className="sub" style={{ padding: '10px 14px' }}>Mostrando os 20 contratos mais recentes de {lista.length}. Use a busca para achar os outros.</div>}
    </div>}

    {!sel && recentes.length > 0 && <div className="card">
      <h3>Últimos aditivos anexados</h3>
      {recentes.map((a) => <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
        <b>{a.c?.cliente_nome || 'Contrato'}</b> <span className="faint">· {a.c?.numero} · aditivo {a.numero}, assinado em {fmtDate(a.data_assinatura)}</span>
        <div className="sub" style={{ margin: 0 }}>{a.descricao}</div>
      </div>)}
    </div>}

    {sel && contrato && <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3>{contrato.cliente_nome}</h3>
            <div className="sub" style={{ margin: 0 }}>Contrato {contrato.numero} · {fmtDate(contrato.data_contrato || String(contrato.created_at || '').slice(0, 10))}{contrato.vendor ? ` · ${contrato.vendor}` : ''}{Number(contrato.valor_final) > 0 ? ` · ${brl(contrato.valor_final)}` : ''}</div>
          </div>
          <button className="btn ghost" type="button" onClick={() => { setSel(null); setVersao((v) => v + 1) }}>Voltar para a lista</button>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {docs.filter(ehContrato).map((a) => <button key={a.id} className="btn ghost sm" type="button" onClick={() => abrir(a)}>Ver contrato: {a.nome_arquivo || 'PDF'}</button>)}
          {!docs.some(ehContrato) && <span className="sub" style={{ margin: 0 }}>O PDF do contrato original não está no sistema. Dá para subir em Clientes → Contratos → Subir contrato.</span>}
        </div>
        {docs.some(ehAditivo) && <div style={{ marginTop: 12 }}>
          <b>Aditivos que vieram com a importação</b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>{docs.filter(ehAditivo).map((a) => <button key={a.id} className="btn ghost sm" type="button" onClick={() => abrir(a)}>{a.nome_arquivo || 'Aditivo'}</button>)}</div>
        </div>}
      </div>
      <AditivosContrato key={sel} contratoId={sel} />
    </>}
  </>
}
