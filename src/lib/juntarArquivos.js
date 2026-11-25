import { PDFDocument } from 'pdf-lib'

// Vários comprovantes ou fotos num anexo só: junta tudo num PDF (uma página por foto, todas as
// páginas de cada PDF). Assim cada campo continua guardando um arquivo e quem abre vê todos juntos.

const ehPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')
const ehImagem = (f) => (f.type || '').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name || '')
export const podeJuntar = (f) => ehPdf(f) || ehImagem(f)
const LADO_MAX = 2000

async function fotoParaJpeg(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error(`Não consegui abrir a imagem ${file.name}. Tente salvar como JPG ou PDF.`)); i.src = url })
    const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height }
  } finally { URL.revokeObjectURL(url) }
}

export function nomeJuntado(files) {
  const base = String(files[0]?.name || 'anexo').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)
  return `${base}_e_mais_${files.length - 1}.pdf`
}

// Um arquivo: devolve como veio. Vários: um PDF com todos, na ordem escolhida.
export async function juntarArquivos(lista) {
  const files = [...(lista || [])].filter(Boolean)
  if (files.length <= 1) return files[0] || null
  const ruim = files.find((f) => !podeJuntar(f))
  if (ruim) throw new Error(`Para anexar vários arquivos juntos, use PDF ou foto (${ruim.name} não é).`)
  const pdf = await PDFDocument.create()
  for (const f of files) {
    if (ehPdf(f)) {
      let doc
      try { doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }) } catch (_) { throw new Error(`Não consegui abrir o PDF ${f.name}.`) }
      const paginas = await pdf.copyPages(doc, doc.getPageIndices())
      paginas.forEach((p) => pdf.addPage(p))
    } else {
      const { bytes, w, h } = await fotoParaJpeg(f)
      const img = await pdf.embedJpg(bytes)
      // Página A4 (em pé ou deitada, como a foto), com a foto centralizada e margem.
      const deitada = w > h
      const [pw, ph] = deitada ? [842, 595] : [595, 842]
      const k = Math.min((pw - 40) / w, (ph - 40) / h)
      const page = pdf.addPage([pw, ph])
      page.drawImage(img, { x: (pw - w * k) / 2, y: (ph - h * k) / 2, width: w * k, height: h * k })
    }
  }
  const bytes = await pdf.save()
  return new File([bytes], nomeJuntado(files), { type: 'application/pdf' })
}
