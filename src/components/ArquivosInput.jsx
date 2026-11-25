import { useRef } from 'react'

// Escolha de um ou mais arquivos (comprovantes, fotos): mostra a lista, deixa tirar e adicionar mais.
// Ao salvar, a tela junta tudo num PDF com juntarArquivos().
export default function ArquivosInput({ arquivos = [], onChange, accept = 'application/pdf,image/*', disabled, rotulo = 'Escolher arquivo' }) {
  const ref = useRef(null)
  const add = (fl) => { const novos = [...(fl || [])]; if (novos.length) onChange([...arquivos, ...novos]) }
  return <div>
    {arquivos.length > 0 && <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 6px' }}>
      {arquivos.map((f, i) => <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{f.name}</span>
        <button type="button" className="btn ghost sm" disabled={disabled} aria-label={`Tirar ${f.name}`} onClick={() => onChange(arquivos.filter((_, j) => j !== i))}>×</button>
      </li>)}
    </ul>}
    <label className={'btn ghost sm' + (disabled ? ' disabled' : '')} style={{ cursor: disabled ? 'default' : 'pointer' }}>
      {arquivos.length ? '+ Adicionar outro arquivo' : rotulo}
      <input ref={ref} type="file" multiple accept={accept} disabled={disabled} style={{ display: 'none' }} onChange={(e) => { add(e.target.files); e.target.value = '' }} />
    </label>
    {arquivos.length > 1 && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>Os {arquivos.length} arquivos serão juntados num PDF só.</div>}
  </div>
}
