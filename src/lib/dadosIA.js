// Dados do contrato devolvidos pela leitura por IA, no formato do parseContrato (sem React nem Supabase, para testar).
const txt = (v) => (v === null || v === undefined ? '' : String(v).trim())

// "12.345,67", "12345.67", 12345.67 → 12345.67
export function valorDaIA(v) {
  if (typeof v === 'number') return v > 0 ? v : null
  const s = txt(v).replace(/[R$\s]/g, '')
  if (!s) return null
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''))
  return n > 0 ? n : null
}

// "2026-11-19" ou "19/11/2026" → "2026-11-19"
export function dataDaIA(v) {
  const s = txt(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}

export function dadosDaIA(d = {}) {
  return {
    cliente: txt(d.cliente_nome),
    cpf: txt(d.cliente_cpf),
    telefone: txt(d.cliente_telefone),
    endereco: txt(d.cliente_endereco),
    data: dataDaIA(d.data_contrato),
    valor: valorDaIA(d.valor_total),
    vendedor: txt(d.vendedor),
    forma_pagamento: txt(d.forma_pagamento),
    legivel: d.legivel !== false,
  }
}

// IA primeiro; o que ela não trouxe vem da leitura de texto (OCR ou PDF).
export function juntarLeituras(ia, texto) {
  if (!ia) return texto
  const out = { ...texto }
  for (const k of Object.keys(ia)) if (ia[k] !== '' && ia[k] !== null && ia[k] !== undefined) out[k] = ia[k]
  return out
}
