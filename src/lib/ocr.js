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
