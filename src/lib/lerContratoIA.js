import { supabase } from './supabase.js'
import { dadosDaIA } from './dadosIA.js'
export { juntarLeituras } from './dadosIA.js'

// Leitura do contrato por IA (foto ou PDF escaneado): o navegador manda o arquivo para a função
// "ler-contrato" do Supabase, que repassa ao fluxo do n8n com o Claude e devolve os dados do cliente.

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const LADO_MAX = 2000

const paraBase64 = (blob) => new Promise((ok, falha) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).split(',')[1] || '')
  r.onerror = () => falha(r.error)
  r.readAsDataURL(blob)
})

// Foto grande do celular: reduz para no máximo 2000 px e JPEG, o que basta para ler e sobe rápido.
async function reduzirFoto(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url })
    const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
    return blob ? { base64: await paraBase64(blob), media_type: 'image/jpeg' } : null
  } finally { URL.revokeObjectURL(url) }
}

export async function prepararArquivo(file) {
  const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (ehPdf) return file.size <= 9_000_000 ? { base64: await paraBase64(file), media_type: 'application/pdf' } : null
  try { const r = await reduzirFoto(file); if (r) return r } catch (_) { /* formato que o navegador não abre (ex.: HEIC) */ }
  return TIPOS.includes(file.type) && file.size <= 9_000_000 ? { base64: await paraBase64(file), media_type: file.type } : null
}

// Devolve os dados lidos já no formato do parseContrato, ou null se a IA não respondeu.
export async function lerContratoIA(file) {
  const corpo = await prepararArquivo(file)
  if (!corpo) return null
  const { data, error } = await supabase.functions.invoke('ler-contrato', { body: corpo })
  if (error || !data?.ok || !data.dados) return null
  return dadosDaIA(data.dados)
}
