/** Rasteriserar public/icons/icon.svg till PNG-ikoner för PWA-manifestet. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const svg = readFileSync(path.join(dir, 'icon.svg'))
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(path.join(dir, `icon-${size}.png`))
  console.log(`icon-${size}.png`)
}
