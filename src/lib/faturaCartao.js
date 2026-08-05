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
  // Se não casou nenhum formato de PDF (ex.: veio de FOTO/OCR), tenta Nubank.
  if (!itens.length) {
    const nb = parseNubankTexto(arr)
    if (nb.itens.length) return nb
  }
  return { cartao, mesRef, itens }
}

// ---- Nubank (a partir de FOTO/print via OCR) ----
const MESES_FULL = { janeiro: 1, fevereiro: 2, marco: 3, 'março': 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 }
const normLinha = (l) => l
  .replace(/R\s*[S$§5]\s*(?=-?\s*[\d])/g, 'R$ ') // "RS 747,60" / "R§" -> "R$ "
  .replace(/[−—–]/g, '-') // sinais de menos unicode -> '-'
  .replace(/\s+/g, ' ').trim()

function nubankCabecalho(lines) {
  let mesRef = ''
  for (const l of lines) {
    const m = l.match(/\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i)
    if (m) { const mm = MESES_FULL[m[1].toLowerCase()]; if (mm) { mesRef = `${m[2]}-${pad(mm)}`; break } }
  }
  return { cartao: 'Nubank', mesRef }
}

// Recebe texto (linhas) do OCR de um print da fatura do Nubank.
export function parseNubankTexto(lines) {
  const arr = (Array.isArray(lines) ? lines : String(lines).split('\n')).map(normLinha).filter(Boolean)
  const { cartao, mesRef } = nubankCabecalho(arr)
  const anoFat = /^\d{4}-\d{2}$/.test(mesRef) ? Number(mesRef.slice(0, 4)) : null
  const itens = []
  let pendingDesc = ''
  const reValor = /R\$\s*-?\s*[\d.]+,\d{2}/
  const reParc = /Parcela\s*(\d{1,2}\/\d{1,2})/i

  for (const l of arr) {
    const parc = l.match(reParc)
    if (reValor.test(l)) {
      const tokens = l.match(/R\$\s*-?\s*[\d.]+,\d{2}/g)
      const valTok = tokens[tokens.length - 1]
      const idx = l.lastIndexOf(valTok)
      // data no início: "30 JUL" / "30JUL"
      const dm = l.match(/^\s*(\d{1,2})\s*([A-Za-zç]{3})\b/)
      let head = ''
      let dia = null, mon = null
      if (dm) { dia = Number(dm[1]); mon = MESES[dm[2].toLowerCase().slice(0, 3)]; head = l.slice(dm[0].length) }
      else head = l
      // descrição = do começo (após data) até o valor
      let desc = (head.slice(0, head.length - (l.length - idx))).trim()
      if (desc === head.trim()) desc = head.slice(0, idx >= 0 ? idx : head.length).trim()
      desc = l.slice(dm ? dm[0].length : 0, idx).trim()
      // se não achou data, remove um token-lixo inicial que contenha mês (ex.: "MNJUL", "tJUL")
      if (!dm) desc = desc.replace(/^\S*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\S*\s*/i, (m0) => { const mm = m0.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i); if (mm) mon = MESES[mm[1].toLowerCase()]; return '' }).trim()
      desc = ((pendingDesc + ' ' + desc).trim()).replace(/[-\s]+$/, '').trim()
      desc = desc.replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').replace(/^cart\w{0,2}es\s+/i, '').trim()
      pendingDesc = ''
      // crédito só pelo rótulo (o "-" antes do R$ costuma ser separador "desc - Parcela")
      const credito = /pagamento recebido|estorno|cr[eé]dito|reembolso/i.test(l) || /R\$\s*-\s*[\d.]+,\d{2}/.test(l)
      // pula linha de total (sem data e sem descrição textual)
      if (!dm && !/[A-Za-zÀ-ÿ]{3}/.test(desc)) continue
      let valor = parseMoney(valTok)
      if (valor === null) continue
      valor = credito ? -Math.abs(valor) : Math.abs(valor)
      let data = null
      if (dia && mon && anoFat) { let ano = anoFat; if (mon > Number(mesRef.slice(5, 7))) ano -= 1; data = `${ano}-${pad(mon)}-${pad(dia)}` }
      const pInline = desc.match(reParc)
      itens.push({
        data_compra: data,
        descricao: (desc.replace(reParc, '').replace(/[-\s]+$/, '').trim()) || l,
        parcela: parc ? parc[1] : (pInline ? pInline[1] : ''),
        valor_usd: null, valor,
        credito, encargo: /\b(iof|juros|encargo|anuidade|multa|rotativo)\b/i.test(desc),
      })
    } else if (parc && itens.length) {
      itens[itens.length - 1].parcela = parc[1]
    } else if (/[A-Za-zÀ-ÿ]{3}/.test(l) && !/vencimento|fechamento|fatura|cart\w{0,2}es|\bde \d{4}\b|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/i.test(l)) {
      // possível descrição que "quebrou" para cima da linha do valor
      pendingDesc = l
    }
  }
  return { cartao, mesRef, itens }
}

// Sugestão simples de bucket por palavra-chave. Ajustável.
const REGRAS = [
  { re: /(anthropic|openai|supabase|google ads|google workspace|canva|facebk|facebook|meta |netlify|amazon ad|amazonprime|amazon prime|apple com|uber|dl google|99app|99 ?inapp|pop \d)/i, bucket: 'loja' },
]
export function sugerirBucket(descricao, padrao = 'loja') {
  for (const r of REGRAS) if (r.re.test(descricao || '')) return r.bucket
  return padrao
}

// Sugestão de CATEGORIA de gasto (tipo de despesa), por palavra-chave.
const REGRAS_CAT = [
  { re: /(anthropic|openai|supabase|google workspace|dl google|canva|apple com|apple\.com|netlify|amazonprime|amazon prime|amazon ad|spotify|microsoft|adobe|vindi|ebn |htm\*|12min|figma)/i, cat: 'app' },
  { re: /(facebk|facebook|google ads|\bmeta\b|instagram|marketing|adwords|boost)/i, cat: 'marketing' },
  { re: /(mercadolivre|mercado livre|mercadoli|mercado\*|\bmeli\b)/i, cat: 'mercadolivre' },
  { re: /(uber|99app|99 ?inapp|99pop|99inapp|\bpop \d|\bpop\d|cabify|dl\*uber|dl uber|indriver|posto|combust|ipiranga|shell|petrobras|ampm)/i, cat: 'transporte' },
  { re: /(promob|rudegon|electrolux|cassol|rc conect|r m lima|metalon|perfar|rafex|vidra|marcenaria|ferragen|donnaferragens|tintas|eletroras|eletro)/i, cat: 'industria' },
  { re: /(amazonmktplc|amazon marketplace|magalu|americanas|shopee|aliexpress|leroy|telha|casa do ma|casaprin)/i, cat: 'materiais' },
  { re: /(ifood|restaurante|lanche|padaria|assai|atacad|supermerc|mercado municipal|bar |cafe|coffee|burger|pizzar)/i, cat: 'alimentacao' },
  { re: /(iof|juros|encargo|anuidade|multa|rotativo|tarifa)/i, cat: 'encargos' },
  { re: /(clinica|farmacia|drogaria|hospital|academia|fit |saude|odonto|laborat)/i, cat: 'saude' },
  { re: /(azul|latam|gol |cvc|hotel|reserva|airbnb|booking|passagem)/i, cat: 'viagem' },
]
export function sugerirCategoria(descricao) {
  for (const r of REGRAS_CAT) if (r.re.test(descricao || '')) return r.cat
  return 'outros'
}
