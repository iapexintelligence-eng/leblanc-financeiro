export const brl = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const brlShort = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k'
  return brl(n)
}

// Formata uma data (YYYY-MM-DD ou ISO) para dd/mm/aaaa SEM cair no bug de fuso.
// Datas puras (sem hora) são tratadas como locais, não UTC.
export const fmtDate = (d) => {
  if (!d) return '—'
  const s = String(d)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const dt = new Date(s)
  return isNaN(dt) ? '—' : dt.toLocaleDateString('pt-BR')
}

// Retorna hoje em YYYY-MM-DD no fuso local (para inputs date), sem UTC shift.
export const today = () => {
  const d = new Date()
  const off = d.getTimezoneOffset() * 60000
  return new Date(d - off).toISOString().slice(0, 10)
}

export const addDays = (isoDate, days) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const off = dt.getTimezoneOffset() * 60000
  return new Date(dt - off).toISOString().slice(0, 10)
}

// Adiciona N dias ÚTEIS (pula sábado/domingo) a uma data YYYY-MM-DD.
export const addBusinessDays = (isoDate, n) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  let added = 0
  while (added < n) {
    dt.setDate(dt.getDate() + 1)
    const wd = dt.getDay()
    if (wd !== 0 && wd !== 6) added++
  }
  const off = dt.getTimezoneOffset() * 60000
  return new Date(dt - off).toISOString().slice(0, 10)
}

// Conta dias úteis entre hoje e uma data-alvo (negativo = já passou / atrasado).
export const businessDaysUntil = (targetIso) => {
  if (!targetIso) return null
  const t = targetIso.slice(0, 10)
  const hoje = today()
  if (t === hoje) return 0
  const atrasado = t < hoje
  const [ay, am, ad] = (atrasado ? t : hoje).split('-').map(Number)
  const [by, bm, bd] = (atrasado ? hoje : t).split('-').map(Number)
  const a = new Date(ay, am - 1, ad), b = new Date(by, bm - 1, bd)
  let count = 0
  const cur = new Date(a)
  while (cur < b) {
    cur.setDate(cur.getDate() + 1)
    const wd = cur.getDay()
    if (wd !== 0 && wd !== 6) count++
  }
  return atrasado ? -count : count
}

// Adiciona N meses a uma data YYYY-MM-DD, mantendo o dia quando possível.
export const addMonths = (isoDate, months) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1 + months, d)
  const off = dt.getTimezoneOffset() * 60000
  return new Date(dt - off).toISOString().slice(0, 10)
}
