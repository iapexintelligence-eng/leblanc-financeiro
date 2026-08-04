import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Extrai o texto das primeiras páginas (onde ficam os dados do contrato).
export async function extrairTexto(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buf }).promise
  let txt = ''
  const nMax = Math.min(pdf.numPages, 2)
  for (let i = 1; i <= nMax; i++) {
    const page = await pdf.getPage(i)
    const c = await page.getTextContent()
    txt += c.items.map((it) => it.str).join(' ') + '\n'
  }
  return txt
}

// Extrai o texto AGRUPADO POR LINHA (uma linha da fatura = uma string), de todas
// as páginas. Necessário para faturas de cartão, onde cada transação é uma linha.
export async function extrairLinhas(file, password) {
  const buf = await file.arrayBuffer()
  const params = { data: buf }
  if (password) params.password = password
  const pdf = await pdfjs.getDocument(params).promise
  const linhas = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const c = await page.getTextContent()
    const mapa = {}
    for (const it of c.items) {
      if (!it.str || !it.str.trim()) continue
      const y = Math.round(it.transform[5])
      const x = it.transform[4]
      ;(mapa[y] ||= []).push({ x, s: it.str })
    }
    const ys = Object.keys(mapa).map(Number).sort((a, b) => b - a)
    for (const y of ys) {
      const linha = mapa[y].sort((a, b) => a.x - b.x).map((o) => o.s).join(' ').replace(/\s+/g, ' ').trim()
      if (linha) linhas.push(linha)
    }
  }
  return linhas
}

// Tenta ler os campos de um contrato Le Blanc. Retorna o que conseguir; o resto fica vazio.
export function parseContrato(txt) {
  const t = (txt || '').replace(/\s+/g, ' ')
  const pick = (re) => { const m = t.match(re); return m ? (m[1] || '').trim() : '' }

  // Cliente costuma aparecer como "1058 - NOME DO CLIENTE" (código - nome)
  let cliente = ''
  const mc = t.match(/\b\d{3,6}\s*-\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.\-]{4,60})/)
  if (mc) cliente = mc[1].trim()
  else cliente = pick(/CLIENTE\b[:\s]*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '.\-]{4,60}?)\s*(?:CPF|CNPJ|R\.?G|NASC)/i)
  cliente = cliente.split(/\s+(?:CPF|CNPJ|Normal|Especial|R\.?G|Nasc|Nascimento|Tipo|Telefone|Endere|Profiss|F[íi]sica|Jur[íi]dica)/i)[0].trim()

  const cpf = pick(/CPF\s*\/?\s*C?N?P?J?\b[:\s]*([\d.\-\/]{11,18})/i)
  const dataStr = pick(/DATA DO CONTRATO[^\d]*(\d{2}\/\d{2}\/\d{4})/i) || pick(/(\d{2}\/\d{2}\/\d{4})/)
  const valorStr = pick(/TOTAL A (?:PRAZO|SER PAGO)[^\d]*([\d.]+,\d{2})/i)
    || pick(/Total (?:do pedido|a ser pago)[:\s]*R?\$?\s*([\d.]+,\d{2})/i)

  let data = ''
  if (dataStr) { const [d, m, a] = dataStr.split('/'); data = `${a}-${m}-${d}` }
  const valor = valorStr ? Number(valorStr.replace(/\./g, '').replace(',', '.')) : null
  return { cliente, cpf, valor, data, vendedor: '' }
}
