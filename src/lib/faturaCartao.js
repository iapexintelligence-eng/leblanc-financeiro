// Leitor de fatura de cartão (PDF) -> lista de transações.
// Suporta dois formatos, detectados linha a linha:
//  (A) Sicredi  : "DD/mon HH:MM  Descrição ...  R$ 1.234,56"
//  (B) Itaú/MC  : "DD-MM-AAAA Descrição [PARC nn/nn] Local\ 1.234,56"
// Escrito de forma tolerante para faturas parecidas (uma transação por linha).

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 }
const pad = (x) => String(x).padStart(2, '0')

// "R$ 1.234,56" / "-R$ 6.209,73" / "-18.651,72" / "222,07" -> número (mantém sinal)
function parseMoney(s) {
  if (!s) return null
  const neg = /-/.test(s)
  const num = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.').replace(/-/g, '')
  const v = parseFloat(num)
  if (isNaN(v)) return null
  return neg ? -Math.abs(v) : Math.abs(v)
}

// Descobre cartão e mês de referência a partir do texto todo (linhas)
function acharCabecalho(lines) {
  let brand = ''
  let final = ''
  let venc = ''
  const isMC = lines.some((l) => /mastercard/i.test(l))
  const isVisa = lines.some((l) => /\bvisa\b/i.test(l))
  if (isMC) brand = 'Mastercard'
  else if (isVisa) brand = 'Visa'

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!final) {
      // "5526 XXXX XXXX 3671" (Itaú) ou "final 9514" (Sicredi)
      const m1 = l.match(/\b\d{4}\s*[X*]{4}\s*[X*]{4}\s*(\d{4})\b/i)
      const m2 = l.match(/\bfinal\s*(\d{3,4})\b/i)
      if (m1) final = m1[1]
      else if (m2) final = m2[1]
    }
    if (!venc) {
      // Sicredi: "Vencimento 10/08/2026" na mesma linha
      const v1 = l.match(/Vencimento\s*(\d{2})\/(\d{2})\/(\d{4})/i)
      if (v1) venc = `${v1[3]}-${v1[2]}`
      // Itaú: "Data de Vencimento:" e a data numa linha logo a seguir
      else if (/Data de Vencimento/i.test(l)) {
        for (let j = i; j <= i + 3 && j < lines.length; j++) {
          const d = lines[j].match(/^\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/)
          if (d) { venc = `${d[3]}-${d[2]}`; break }
        }
      }
    }
  }
  let cartao = ''
  if (brand && final) cartao = `${brand} final ${final}`
  else if (final) cartao = `Cartão final ${final}`
  else if (brand) cartao = brand
  return { cartao, mesRef: venc }
}

// Itaú: infere data a partir de DD-MM-AAAA (ano já vem na linha)
// Sicredi: infere o ano a partir do mês vs mês de fechamento
function anoDoMesRef(mesRef) {
  if (/^\d{4}-\d{2}$/.test(mesRef || '')) return { ano: Number(mesRef.slice(0, 4)), mes: Number(mesRef.slice(5, 7)) }
  return { ano: null, mes: null }
}

function limparDescSicredi(resto) {
  let d = resto
  d = d.replace(/-?\s*R\$\s*[\d.]+,\d{2}/g, ' ')
  d = d.replace(/US\$\s*[\d.]+,\d{2}/g, ' ')
  d = d.replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ')
  const m = d.match(/\b(?:Online|Presencial)\b\s*(.*)/i)
  if (m) d = m[1]
  return d.replace(/\s+/g, ' ').trim()
}

function limparDescItau(resto) {
  let d = resto
  // remove tudo a partir da barra invertida (local + valor) e o valor final
  d = d.replace(/\\.*$/, ' ')
  d = d.replace(/-?\d[\d.]*,\d{2}\s*$/, ' ')
  d = d.replace(/\bPARC\s*\d{1,2}\/\d{1,2}\b/gi, ' ')
  return d.replace(/\s+/g, ' ').trim()
}

const reSicredi = /^\s*(\d{1,2})\/([a-zç]{3})\s+\d{2}:\d{2}\s+(.*)$/i
const reItau = /^\s*(\d{2})-(\d{2})-(\d{4})\s+(.*)$/

export function parseFaturaCartao(lines) {
  const arr = Array.isArray(lines) ? lines : String(lines).split('\n')
  const { cartao, mesRef } = acharCabecalho(arr)
  const { ano: anoFat, mes: mesFat } = anoDoMesRef(mesRef)
  const itens = []

  for (const raw of arr) {
    const l = raw.replace(/\s+/g, ' ').trim()

    // --- Formato Itaú / Mastercard ---
    let m = l.match(reItau)
    if (m) {
      const [, dia, mes, ano, resto] = m
      const nums = resto.match(/-?\d[\d.]*,\d{2}/g)
      if (!nums || !nums.length) continue
      const valor = parseMoney(nums[nums.length - 1])
      if (valor === null || valor === 0) continue
      const parcelaM = resto.match(/PARC\s*(\d{1,2}\/\d{1,2})/i)
      const descricao = limparDescItau(resto)
      itens.push({
        data_compra: `${ano}-${mes}-${dia}`,
        descricao: descricao || l,
        parcela: parcelaM ? parcelaM[1] : '',
        valor_usd: null,
        valor,
        credito: valor < 0,
        encargo: /\b(iof|juros|encargo|anuidade|multa|rotativo)\b/i.test(descricao),
      })
      continue
    }

    // --- Formato Sicredi ---
    m = l.match(reSicredi)
    if (m) {
      const [, dia, mesNome, resto] = m
      const moedas = resto.match(/-?\s*R\$\s*[\d.]+,\d{2}/g)
      if (!moedas || !moedas.length) continue
      const valor = parseMoney(moedas[moedas.length - 1])
      if (valor === null || valor === 0) continue
      const usd = resto.match(/US\$\s*[\d.]+,\d{2}/)
      const parcelaM = resto.match(/\b(\d{1,2}\/\d{1,2})\b/)
      const descricao = limparDescSicredi(resto)
      const mn = MESES[String(mesNome).toLowerCase().slice(0, 3)]
      let dataC = null
      if (mn) { let ano = anoFat; if (ano != null && mesFat != null && mn > mesFat) ano -= 1; if (ano != null) dataC = `${ano}-${pad(mn)}-${pad(Number(dia))}` }
      itens.push({
        data_compra: dataC,
        descricao: descricao || l,
        parcela: parcelaM ? parcelaM[1] : '',
        valor_usd: usd ? parseMoney(usd[0]) : null,
        valor,
        credito: valor < 0,
        encargo: /\b(iof|juros|encargo|anuidade|multa|rotativo)\b/i.test(descricao),
      })
      continue
    }
  }
  return { cartao, mesRef, itens }
}

// Sugestão simples de bucket por palavra-chave. Ajustável.
const REGRAS = [
  { re: /(anthropic|openai|supabase|google ads|google workspace|canva|facebk|facebook|meta |amazon ad|amazonprime|amazon prime|apple com|uber|dl google|99app|99 ?inapp|pop \d)/i, bucket: 'loja' },
]
export function sugerirBucket(descricao, padrao = 'loja') {
  for (const r of REGRAS) if (r.re.test(descricao || '')) return r.bucket
  return padrao
}
