import { useEffect, useState } from 'react'
import { audio } from './audio/AudioManager'
import { loadRecordings, loadServerRecordings } from './audio/recordings'
import { loadCustomWords } from './content/custom'
import { setSfxVolume } from './audio/sfx'
import { levels } from './content'
import { useApp } from './store/app'
import { useSettings } from './store/settings'
import Boot from './screens/Boot'
import Onboarding from './screens/Onboarding'
import MapScreen from './screens/MapScreen'
import SessionScreen from './screens/SessionScreen'
import RewardScreen from './screens/RewardScreen'
import ParentScreen from './screens/ParentScreen'
import PauseScreen from './screens/PauseScreen'
import StickerBook from './screens/StickerBook'
import AlphabetWall from './screens/AlphabetWall'
import RocketScreen from './screens/RocketScreen'
import FinaleScreen from './screens/FinaleScreen'

function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth)
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth)
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return portrait
}

export default function App() {
  const screen = useApp((s) => s.screen)
  const volume = useSettings((s) => s.volume)
  const portrait = useIsPortrait()

  useEffect(() => {
    void audio.init().then(() => Promise.all([loadServerRecordings(), loadRecordings(), loadCustomWords()]))
    // Endast i dev: ?task=build-word:mor hoppar rakt in i en enda uppgift.
    const params = new URLSearchParams(window.location.search)
    if (import.meta.env.DEV && params.get('task')) useApp.getState().startSession(levels[0].id)
    // ?unlockAll=1 slår på testläget (alla planeter öppna), ?unlockAll=0 stänger av det.
    if (params.has('unlockAll')) useSettings.getState().setUnlockAll(params.get('unlockAll') !== '0')
  }, [])

  useEffect(() => {
    audio.setVolume(volume)
    setSfxVolume(volume)
  }, [volume])

  return (
    <>
      {screen === 'boot' && <Boot />}
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'map' && <MapScreen />}
      {screen === 'session' && <SessionScreen />}
      {screen === 'reward' && <RewardScreen />}
      {screen === 'parent' && <ParentScreen />}
      {screen === 'pause' && <PauseScreen />}
      {screen === 'stickers' && <StickerBook />}
      {screen === 'alphabet' && <AlphabetWall />}
      {screen === 'rocket' && <RocketScreen />}
      {screen === 'finale' && <FinaleScreen />}
      {portrait && (
        <div className="screen z-50 flex flex-col items-center justify-center gap-6 bg-space/95">
          <div className="big-emoji animate-[spin_3s_linear_infinite] text-[96px]">🔄</div>
          <div className="big-emoji text-[64px]">📱➡️🖥️</div>
        </div>
      )}
    </>
  )
}
