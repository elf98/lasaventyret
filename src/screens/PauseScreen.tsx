import { useEffect } from 'react'
import { audio } from '../audio/AudioManager'
import BigButton from '../components/BigButton'
import Mascot from '../components/Mascot'
import Starfield from '../components/Starfield'
import { phraseId } from '../content/audioIds'
import { useApp } from '../store/app'

/** Efter ~10 minuter: maskoten föreslår paus. Inget hindrar att man fortsätter. */
export default function PauseScreen() {
  const go = useApp((s) => s.go)
  const resetPlayTimer = useApp((s) => s.resetPlayTimer)

  useEffect(() => {
    void audio.speak(phraseId('pause'))
    return () => audio.stop()
  }, [])

  return (
    <div className="screen flex flex-col items-center justify-center gap-8">
      <Starfield count={40} />
      <div className="relative z-10 flex items-center gap-8">
        <Mascot size={220} mood="sleep" pokeable={false} />
        <span className="big-emoji text-[120px]">💤</span>
      </div>
      <div className="relative z-10">
        <BigButton
          icon="▶️"
          size="md"
          color="bg-white/20"
          speakId={phraseId('pause_more')}
          label="En stund till"
          onPress={() => {
            resetPlayTimer()
            go('map')
          }}
        />
      </div>
    </div>
  )
}
