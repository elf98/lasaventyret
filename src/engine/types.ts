import type { GameId } from '../content'

/** contrast = ordet i ljudsorteringen (m eller n?), egen räkning skild från ordets läsbehärskning. */
/** phoneme = ljudlekarna på Startrampen (rim, första/sista ljud, antal ljud) – hörförmåga, inte läsning. */
export type ItemKind = 'letter' | 'word' | 'sightword' | 'sentence' | 'story' | 'contrast' | 'phoneme'

export interface MasteryItem {
  id: string
  kind: ItemKind
  /** Antal rätt i rad (nollställs vid fel). */
  streak: number
  /** Sessioner där de senaste rätt-svaren i raden gavs (unika id:n). */
  sessionsCorrect: string[]
  attempts: number
  errors: number
  lastSeenAt: number
  /** Tidpunkt då objektet bör repeteras igen. */
  dueAt: number
  /** Nuvarande repetitionsintervall i dagar. */
  intervalDays: number
  mastered: boolean
}

export interface SessionRecord {
  id: string
  levelId: string
  startedAt: number
  endedAt: number
  tasks: number
  correct: number
  stars: number
  practiced: string[]
}

export interface Task {
  id: string
  game: GameId
  /** Id för det som tränas (bokstav, ord ...). */
  targetId: string
  kind: ItemKind
  /**
   * Beror på spel: catch-sound = bokstäver att välja bland (inkl. target),
   * build-word = brickor (ordets ljud + distraktorer), sound-train = ord-id
   * för bildvalet efter ljudningen (tomt för stavelser utan bild).
   */
  options: string[]
  /** Rätt svar när det inte är target självt (rimpartner, rätt bild, svarsindex). */
  answer?: string
  /** Bokstaven uppgiften handlar om när options är något annat (omvänd ljudsortering). */
  letter?: string
  /**
   * Variant av spelet: 'read' = Vilket ord? med bilden först och orden att läsa (inget ljud förrän
   * efter valet); 'g|mall|ord|ord' = en mening genererad ur en mall (Meningsmaskinen).
   */
  variant?: string
  isReview: boolean
}

export interface TaskResult {
  taskId: string
  targetId: string
  kind: ItemKind
  /** Löst utan något fel? */
  clean: boolean
  wrongTaps: number
  scaffolded: boolean
}
