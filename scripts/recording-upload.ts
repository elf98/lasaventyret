/**
 * Vite-plugin: tar emot egna inspelningar från föräldravyn när appen körs i dev (npm run dev) och
 * sparar dem i public/recorded/ med ett index. Samma protokoll som public/upload-recording.php på
 * servern, så klienten behöver inte veta var den kör.
 *
 *   POST   /upload-recording.php?id=letter.s   (body: audio/wav)  -> { ok, file, hash }
 *   DELETE /upload-recording.php?id=letter.s                       -> { ok }
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const KEY = 'lasaventyret'
const ID_RE = /^[a-z0-9_.åäö-]{1,80}$/i

interface Index {
  items: Record<string, { file: string; hash: string; at: string }>
}

const translit: Record<string, string> = { å: 'aa', ä: 'ae', ö: 'oe', Å: 'AA', Ä: 'AE', Ö: 'OE' }
const fileFor = (id: string) => id.replace(/[åäöÅÄÖ]/g, (c) => translit[c]).replace(/[^a-zA-Z0-9._-]/g, '_') + '.wav'

export function recordingUpload(): Plugin {
  return {
    name: 'lasaventyret-recording-upload',
    configureServer(server) {
      const dir = path.resolve(server.config.root, 'public', 'recorded')
      const indexPath = path.join(dir, 'index.json')
      const readIndex = (): Index => (existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, 'utf8')) as Index) : { items: {} })
      server.middlewares.use('/upload-recording.php', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x')
        const id = url.searchParams.get('id') ?? ''
        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.headers['x-recording-key'] !== KEY) return reply(403, { ok: false, error: 'nyckel' })
        if (!ID_RE.test(id)) return reply(400, { ok: false, error: 'id' })
        mkdirSync(dir, { recursive: true })
        const index = readIndex()
        const file = fileFor(id)
        if (req.method === 'DELETE') {
          if (existsSync(path.join(dir, file))) rmSync(path.join(dir, file))
          delete index.items[id]
          writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
          return reply(200, { ok: true })
        }
        if (req.method !== 'POST') return reply(405, { ok: false })
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const data = Buffer.concat(chunks)
          if (data.length < 100 || data.length > 5_000_000 || data.toString('ascii', 0, 4) !== 'RIFF') return reply(400, { ok: false, error: 'wav' })
          writeFileSync(path.join(dir, file), data)
          const hash = createHash('sha1').update(data).digest('hex').slice(0, 12)
          index.items[id] = { file, hash, at: new Date().toISOString() }
          writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
          server.config.logger.info(`inspelning sparad: public/recorded/${file}`)
          reply(200, { ok: true, file, hash })
        })
      })
    },
  }
}
