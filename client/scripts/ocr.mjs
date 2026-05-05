import { createWorker } from 'tesseract.js'

const imgPath = process.argv[2]
if (!imgPath) {
  console.error('Usage: node scripts/ocr.mjs <image-path>')
  process.exit(1)
}

const worker = await createWorker('chi_sim+eng')
const { data: { text } } = await worker.recognize(imgPath)
console.log(text)
await worker.terminate()
