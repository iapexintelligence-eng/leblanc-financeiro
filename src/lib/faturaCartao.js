// Leitor de fatura de cartão (PDF) -> lista de transações.
// Feito e testado sobre o layout Sicredi Visa Empresas, mas escrito de forma
// tolerante para funcionar com faturas parecidas (uma transação por linha).

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 }
const pad = (x) => String(x).padStart(2, '0')

// "R$ 1.234,56" / "-R$ 6.209,73" / "US$ 25,00" -> número (negativo mantém sinal)
function parseMoney(s) {
  if (!s) return null
  const neg = /-/.test(s)
  const num = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const v = parseFloat(num)
  if (isNaN(v)) return null
  return neg ? -Math.abs(v) : Math.abs(v)
}

// Descobre cartão e mês de referência a partir do texto todo (linhas)
function acharCabecalho(lines) {
  let cartao = ''
  let mesRef = ''
  for (const l of lines) {
    if (!cartao) {
      const m = l.match(/(Visa|Mastercard|Master|Elo|Amex)[^\d]*final\s*(\d{3,4})/i)
      if (m) cartao = `${m[1]} final ${m[2]}`
      else {
        const f = l.match(/\bfinal\s*(\d{3,4})\b/i)
        if (f) cartao = `Cartão final ${f[1]}`
      }
    }
    if (!mesRef) {
      const v = l.match(/Vencimento\s*(\d{2})\/(\d{2})\/(\d{4})/i)
      if (v) mesRef = `${v[3]}-${v[2]}`
    }
  }
  return { cartao, mesRef }
}

// mesRef = 'YYYY-MM'. Infere o ano da compra a partir do mês.
function dataCompra(dia, mesNome, mesRef) {
  const mn = MESES[String(mesNome).toLowerCase().slice(0, 3)]
  if (!mn) return null
  let ano, mesFat
  if (/^\d{4}-\d{2}$/.test(mesRef || '')) { ano = Number(mesRef.slice(0, 4)); mesFat = Number(mesRef.slice(5, 7)) }
  else { const d = new Date(); ano = d.getFullYear(); mesFat = d.getMonth() + 1 }
  // se o mês da compra é maior que o mês de fechamento, é do ano anterior
  if (mn > mesFat) ano -= 1
  return `${ano}-${pad(mn)}-${pad(Number(dia))}`
}

function limparDescricao(resto) {
  let d = resto
  // tira valores monetários e cotação/dólar
  d = d.replace(/-?\s*R\$\s*[\d.]+,\d{2}/g, ' ')
  d = d.replace(/US\$\s*[\d.]+,\d{2}/g, ' ')
  // tira parcela (03/03)
  d = d.replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ')
  // tira cidade + tipo de compra: pega o que vem depois de Online/Presencial
  const m = d.match(/\b(?:Online|Presencial)\b\s*(.*)/i)
  if (m) d = m[1]
  return d.replace(/\s+/g, ' ').trim()
}

// linhas: array de strings, já agrupadas por linha (uma transação por linha)
export function parseFaturaCartao(lines) {
  const arr = Array.isArray(lines) ? lines : String(lines).split('\n')
  const { cartao, mesRef } = acharCabecalho(arr)
  const itens = []
  const reInicio = /^\s*(\d{1,2})\/([a-zç]{3})\s+\d{2}:\d{2}\s+(.*)$/i

  for (const raw of arr) {
    const l = raw.replace(/\s+/g, ' ').trim()
    const m = l.match(reInicio)
    if (!m) continue
    const [, dia, mesNome, resto] = m
    // último valor em R$ da linha = valor em reais
    const moedas = resto.match(/-?\s*R\$\s*[\d.]+,\d{2}/g)
    if (!moedas || !moedas.length) continue
    const valor = parseMoney(moedas[moedas.length - 1])
    if (valor === null) continue
    const usd = resto.match(/US\$\s*[\d.]+,\d{2}/)
    const parcelaM = resto.match(/\b(\d{1,2}\/\d{1,2})\b/)
    const descricao = limparDescricao(resto)
    const eCredito = valor < 0
    const eEncargo = /\b(iof|juros|encargo|anuidade|multa|rotativo)\b/i.test(descricao)
    itens.push({
      data_compra: dataCompra(dia, mesNome, mesRef),
      descricao: descricao || l,
      parcela: parcelaM ? parcelaM[1] : '',
      valor_usd: usd ? parseMoney(usd[0]) : null,
      valor,
      credito: eCredito,
      encargo: eEncargo,
    })
  }
  return { cartao, mesRef, itens }
}

// Sugestão simples de bucket por palavra-chave. Ajustável.
const REGRAS = [
  { re: /(anthropic|openai|supabase|google workspace|canva|facebk|facebook|meta|amazon ad|amazonprime|amazon prime|apple com|uber|dl google)/i, bucket: 'loja' },
]
export function sugerirBucket(descricao, padrao = 'loja') {
  for (const r of REGRAS) if (r.re.test(descricao || '')) return r.bucket
  return padrao
}
