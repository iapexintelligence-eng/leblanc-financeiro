const DIA = 86400000
export function dataValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false
  const d = new Date(`${s}T12:00:00Z`)
  return !isNaN(d) && d.toISOString().slice(0,10) === s
}
export function hojeSP() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date())
  const p = Object.fromEntries(parts.map(x => [x.type,x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
export function somarDias(data, n) {
  if (!dataValida(data) || !Number.isInteger(n)) throw new Error('Data ou prazo inválido.')
  return new Date(new Date(`${data}T12:00:00Z`).getTime()+n*DIA).toISOString().slice(0,10)
}
export function util(data, feriados = []) {
  const dia = new Date(`${data}T12:00:00Z`).getUTCDay()
  return dia !== 0 && dia !== 6 && !feriados.includes(data)
}
export function somarUteis(data, n, feriados = []) {
  if (!dataValida(data) || !Number.isInteger(n) || n < 0 || n > 10000) throw new Error('Data ou prazo inválido.')
  let d=data, count=0
  while(count<n) { d=somarDias(d,1); if(util(d,feriados)) count++ }
  return d
}
export function restantes(vencimento, hoje = hojeSP(), feriados = []) {
  if (!dataValida(vencimento) || !dataValida(hoje)) return null
  let a=hoje<vencimento?hoje:vencimento, b=hoje<vencimento?vencimento:hoje, n=0
  while(a<b) { a=somarDias(a,1); if(util(a,feriados)) n++ }
  return vencimento<hoje?-n:n
}
export function alertaPrazo(vencimento, { hoje=hojeSP(), feriados=[], encerrada=false }={}) {
  if(encerrada || !dataValida(vencimento)) return null
  const dias=restantes(vencimento,hoje,feriados)
  // Sexta vencida continua atrasada no sábado, ainda que não haja um dia útil completo.
  if(vencimento<hoje) return { nivel:'danger', marco:'vencida', dias, texto:`Vencida · ${Math.abs(dias)} dia(s) úteis de atraso` }
  if(vencimento===hoje) return { nivel:'danger', marco:'hoje', dias, texto:'Vence hoje' }
  if(dias<=2) return { nivel:'danger', marco:'2', dias, texto:`Urgente · ${dias} dia(s) úteis restantes` }
  if(dias<=5) return { nivel:'warn', marco:'5', dias, texto:`Prioridade · ${dias} dia(s) úteis restantes` }
  if(dias<=10) return { nivel:'warn', marco:'10', dias, texto:`Atenção · ${dias} dia(s) úteis restantes` }
  return { nivel:'ok', marco:'normal', dias, texto:`${dias} dias úteis restantes` }
}
