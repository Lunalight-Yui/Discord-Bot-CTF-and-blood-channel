// image to text

const Tesseract = require('tesseract.js')

let _worker = null
let _lang = null

async function getWorker(lang) {
  if (_worker && _lang === lang) return _worker
  if (_worker) await _worker.terminate().catch(() => {})
  _lang = lang
  _worker = await Tesseract.createWorker(lang)
  return _worker
}

/**
 * @param {Buffer} buf - isi gambar
 * @returns {Promise<string>} teks hasil OCR, bisa kosong
 */
async function ocrImage(buf) {
  const lang = process.env.OCR_LANG || 'eng'
  const worker = await getWorker(lang)
  try {
    const { data } = await worker.recognize(buf)
    return (data.text ?? '').trim()
  } catch (err) {
    console.error('[ocr] failed:', err.message)
    return ''
  }
}

module.exports = { ocrImage }
