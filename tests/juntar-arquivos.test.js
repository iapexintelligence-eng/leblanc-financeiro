import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { juntarArquivos, nomeJuntado } from '../src/lib/juntarArquivos.js'

const pdf = async (paginas, nome) => {
  const d = await PDFDocument.create(); for (let i = 0; i < paginas; i++) d.addPage([300, 400])
  return new File([await d.save()], nome, { type: 'application/pdf' })
}

test('um arquivo volta como veio; vários PDFs viram um PDF com todas as páginas', async () => {
  const a = await pdf(1, 'pix-1.pdf'), b = await pdf(2, 'pix-2.pdf')
  assert.equal(await juntarArquivos([a]), a)
  const j = await juntarArquivos([a, b])
  assert.equal(j.type, 'application/pdf')
  assert.equal(j.name, 'pix-1_e_mais_1.pdf')
  assert.equal((await PDFDocument.load(await j.arrayBuffer())).getPageCount(), 3)
})

test('tipo que não dá para juntar avisa em vez de perder o arquivo', async () => {
  const a = await pdf(1, 'a.pdf')
  const x = new File(['<xml/>'], 'pedido.xml', { type: 'text/xml' })
  await assert.rejects(juntarArquivos([a, x]), /use PDF ou foto/)
  assert.equal(nomeJuntado([{ name: 'WhatsApp Image 2026.jpeg' }, {}, {}]), 'WhatsApp_Image_2026_e_mais_2.pdf')
})
