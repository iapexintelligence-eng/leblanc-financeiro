// Cliente com prazo especial combinado: aparece em roxo em todas as telas (lista, quadro, pendências,
// previsibilidade). Marcado na ficha do cliente, com a data combinada e o que foi acordado.
export const prazoEspecial = (d) => (d?.prazo_especial === true || d?.prazo_especial === 'true')
  ? { em: /^\d{4}-\d{2}-\d{2}$/.test(d.prazo_especial_em || '') ? d.prazo_especial_em : null, motivo: d.prazo_especial_motivo || '' }
  : null
export const textoPrazoEspecial = (p) => p ? `Prazo especial${p.em ? ' · ' + p.em.split('-').reverse().join('/') : ''}` : ''
