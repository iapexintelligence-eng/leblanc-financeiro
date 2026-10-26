import { useEffect, useState } from 'react'
import { supabase, authOn } from '../lib/supabase.js'
import { anexarJornada, salvarRegistro } from '../lib/jornada.js'

// Fotos e vídeos do cliente ou da assistência: escolhe vários arquivos de uma vez, envia em paralelo
// e grava na ficha assim que terminam (não precisa clicar em Salvar).
const ehVideo = (m) => /^video\//.test(m.tipo || '') || /\.(mp4|mov|m4v|webm|3gp|avi)$/i.test(m.nome || '')
const SIMULTANEOS = 3

export default function FotosVideos({ registro, eu, onSalvo, podeEditar = true }) {
  const midias = Array.isArray(registro.dados?.midias) ? registro.dados.midias : []
  const [urls, setUrls] = useState({})
  const [envio, setEnvio] = useState(null) // { total, feitos, falhas: [] }
  const [erro, setErro] = useState('')

  useEffect(() => {
    const faltam = midias.map((m) => m.path).filter((p) => !urls[p])
    if (!authOn || !faltam.length) return
    supabase.storage.from('jornada-documentos').createSignedUrls(faltam, 3600).then(({ data }) => {
      if (data) setUrls((u) => ({ ...u, ...Object.fromEntries(data.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl])) }))
    })
  }, [midias.length]) // eslint-disable-line

  async function enviar(lista) {
    const files = [...(lista || [])]
    if (!files.length) return
    if (!registro.id) { setErro('Salve o registro antes de anexar fotos e vídeos.'); return }
    setErro(''); setEnvio({ total: files.length, feitos: 0, falhas: [] })
    const novos = []
    let i = 0
    const trabalhador = async () => {
      while (i < files.length) {
        const f = files[i++]
        try {
          const path = await anexarJornada(f)
          novos.push({ path, nome: f.name, tipo: f.type || '', em: new Date().toISOString(), por: eu?.usuario_id || null })
        } catch (e) { setEnvio((s) => ({ ...s, falhas: [...s.falhas, `${f.name}: ${e.message}`] })) }
        setEnvio((s) => ({ ...s, feitos: s.feitos + 1 }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, files.length) }, trabalhador))
    if (novos.length) {
      try {
        const salvo = await salvarRegistro({ ...registro, dados: { ...registro.dados, midias: [...midias, ...novos] } })
        onSalvo?.(salvo)
      } catch (e) { setErro(`Os arquivos subiram, mas a ficha não foi gravada: ${e.message}`) }
    }
    setEnvio((s) => ({ ...s, fim: true }))
  }

  async function remover(m) {
    if (!window.confirm(`Tirar ${m.nome} da ficha?`)) return
    setErro('')
    try {
      const salvo = await salvarRegistro({ ...registro, dados: { ...registro.dados, midias: midias.filter((x) => x.path !== m.path) } })
      onSalvo?.(salvo)
    } catch (e) { setErro(e.message) }
  }
  const podeTirar = (m) => podeEditar && (eu?.papel === 'gestor' || !m.por || m.por === eu?.usuario_id)

  return <div className="card" style={{ margin: '16px 0' }}>
    <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
      <div><h3 style={{ margin: 0 }}>Fotos e vídeos</h3><div className="sub" style={{ margin: 0 }}>{midias.length ? `${midias.length} arquivo(s)` : 'Nenhum arquivo ainda'} · selecione vários de uma vez; gravam sozinhos ao terminar.</div></div>
      {podeEditar && <label className={'btn' + (envio && !envio.fim ? ' disabled' : '')} style={{ cursor: 'pointer' }}>
        + Adicionar fotos e vídeos
        <input type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} disabled={!!envio && !envio.fim} onChange={(e) => { enviar(e.target.files); e.target.value = '' }} />
      </label>}
    </div>
    {envio && <div className="sub" role="status" style={{ marginTop: 8, color: envio.falhas.length ? 'var(--danger)' : envio.fim ? 'var(--ok)' : undefined }}>
      {envio.fim ? `${envio.total - envio.falhas.length} de ${envio.total} enviado(s).` : `Enviando ${envio.feitos} de ${envio.total}…`}
      {envio.falhas.map((f) => <div key={f}>{f}</div>)}
    </div>}
    {erro && <div className="login-err" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
    {midias.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
      {midias.map((m) => <figure key={m.path} style={{ margin: 0, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }}>
        <a href={urls[m.path] || undefined} target="_blank" rel="noopener noreferrer" title={m.nome} style={{ display: 'block', aspectRatio: '1 / 1' }}>
          {ehVideo(m) ? <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }} aria-label="Vídeo">▶</div>
            : urls[m.path] ? <img src={urls[m.path]} alt={m.nome} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div className="faint" style={{ padding: 8, fontSize: 12 }}>Carregando…</div>}
        </a>
        <figcaption style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', fontSize: 11 }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
          {podeTirar(m) && <button type="button" className="icon-btn" style={{ width: 22, height: 22, padding: 0 }} aria-label={`Tirar ${m.nome}`} title="Tirar da ficha" onClick={() => remover(m)}>×</button>}
        </figcaption>
      </figure>)}
    </div>}
  </div>
}
