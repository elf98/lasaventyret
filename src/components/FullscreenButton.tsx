import { useEffect, useState } from 'react'
import BigButton from './BigButton'
import { phraseId } from '../content/audioIds'

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void }

const doc = document as FsDocument
const root = document.documentElement as FsElement

/** Kan sidan gå i helskärm, och är den inte redan installerad som app (då är den redan helskärm)? */
function available(): boolean {
  const standalone = window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches
  return !standalone && !!(root.requestFullscreen || root.webkitRequestFullscreen)
}

/** Växlar helskärm. Fungerar i Safari på iPad (webkit-prefix) och i vanliga webbläsare; visas inte som installerad app. */
export default function FullscreenButton({ className = '' }: { className?: string }) {
  const [on, setOn] = useState(false)
  const [show] = useState(available)

  useEffect(() => {
    const sync = () => setOn(!!(doc.fullscreenElement || doc.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  if (!show) return null

  const toggle = () => {
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) void doc.exitFullscreen()
      else doc.webkitExitFullscreen?.()
    } else if (root.requestFullscreen) void root.requestFullscreen()
    else root.webkitRequestFullscreen?.()
  }

  return <BigButton size="md" icon={on ? '🡼' : '⛶'} color="bg-black/40" speakId={phraseId('btn_fullscreen')} onPress={toggle} label={on ? 'Lämna helskärm' : 'Helskärm'} className={className} />
}
