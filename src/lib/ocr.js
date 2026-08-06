// OCR de imagem no navegador usando tesseract.js (carregado sob demanda via CDN).
let carregando = null
function carregarTesseract() {
  if (typeof window !== 'undefined' && window.Tesseract) return Promise.resolve(window.Tesseract)
  if (carregando) return carregando
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    s.async = true
    s.onload = () => resolve(window.Tesseract)
    s.onerror = () => reject(new Error('Não consegui carregar o leitor de imagem (OCR). Verifique a conexão.'))
    document.head.appendChild(s)
  })
  return carregando
}

// Retorna as linhas de texto lidas da imagem. onProgress(0..100) opcional.
export async function ocrImagem(file, onProgress) {
  const T = await carregarTesseract()
  const { data } = await T.recognize(file, 'por', {
    logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round((m.progress || 0) * 100)) },
  })
  return (data?.text || '').split('\n')
}

// Desenha a imagem girada em graus (0/90/180/270) e devolve um canvas.
async function girar(file, deg) {
  const bmp = await createImageBitmap(file)
  const swap = deg === 90 || deg === 270
  const w = swap ? bmp.height : bmp.width
  const h = swap ? bmp.width : bmp.height
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.translate(w / 2, h / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
  return c
}

// OCR tolerante à rotação: testa orientações e escolhe a que melhor casa a "pista"
// (regex de palavras esperadas). Bom para FOTOS de documento tortas/deitadas.
export async function ocrImagemAuto(file, { onProgress, pista } = {}) {
  const T = await carregarTesseract()
  const re = pista || /(cliente|contrato|cpf|total|\d{2}\/\d{2}\/\d{4})/i
  const angulos = [0, 270, 90, 180]
  let melhor = { score: -1, linhas: [] }
  for (let i = 0; i < angulos.length; i++) {
    const alvo = angulos[i] === 0 ? file : await girar(file, angulos[i])
    const { data } = await T.recognize(alvo, 'por', {
      logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(((i + (m.progress || 0)) / angulos.length) * 100)) },
    })
    const txt = data?.text || ''
    const score = (txt.match(new RegExp(re, 'gi')) || []).length
    if (score > melhor.score) melhor = { score, linhas: txt.split('\n') }
    if (score >= 3) break // já achou orientação boa; não precisa testar as outras
  }
  return melhor.linhas
}
