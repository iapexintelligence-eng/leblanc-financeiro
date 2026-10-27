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

export { parseContrato } from './lerContrato.js'

// Itens de texto com posição, página a página (para faturas em duas colunas, como a do Sicoob,
// em que juntar por linha mistura as colunas).
export async function extrairItens(file, password) {
  const buf = await file.arrayBuffer()
  const params = { data: buf }
  if (password) params.password = password
  const pdf = await pdfjs.getDocument(params).promise
  const paginas = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const c = await page.getTextContent()
    const largura = page.view[2] - page.view[0]
    const itens = c.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), w: Math.round(it.width || 0), s: it.str.trim() }))
    paginas.push({ largura, altura: page.view[3] - page.view[1], itens })
  }
  return paginas
}
