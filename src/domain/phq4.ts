// ─────────────────────────────────────────────────────────────
// PHQ-4: чистая логика экспресс-скрининга (подшкалы, уровни,
// рекомендации по выбору развёрнутой шкалы). Перенесено из
// DoctorView.vue, чтобы использовать и в других местах.
// ─────────────────────────────────────────────────────────────

/** Подшкалы по массиву из 4 ответов (0–3). -1 = вопрос не отвечен. */
export function phq4Subscores(answers: number[]): { anxiety: number; depression: number; answered: number } {
  const valid = answers.map((a) => (a >= 0 ? a : 0))
  const answered = answers.filter((a) => a >= 0).length
  return {
    anxiety: answers[0] >= 0 ? valid[0] + valid[1] : 0,
    depression: answers[2] >= 0 ? valid[2] + valid[3] : 0,
    answered,
  }
}

/** Уровень по подшкале GAD-2 / PHQ-2 (макс. 6 баллов; порог 3, выраженный — от 5). */
export function phq4Level(subscore: number): string {
  if (subscore < 3) return 'норма'
  if (subscore < 5) return 'умеренно выраженный'
  return 'выраженный'
}

export interface Phq4RecommendationInput {
  /** PHQ-4 полностью заполнен */
  complete: boolean
  /** баллы подшкал тревоги/депрессии */
  anxiety: number
  depression: number
  /** нарушение сна в жалобах пациента */
  sleepComplaint: boolean
  /** соматические жалобы из пунктов ГТР */
  somaticCriteria: boolean
}

/**
 * Ключи рекомендованных развёрнутых шкал по результатам PHQ-4
 * (ISI / HADS / GAD7 / PHQ9 — совпадают с ключами SCALES).
 */
export function phq4RecommendedScaleKeys(input: Phq4RecommendationInput): Set<string> {
  const keys = new Set<string>()
  const { complete, anxiety, depression, sleepComplaint, somaticCriteria } = input
  if (!complete) return keys
  const noAnxietyDepression = anxiety < 3 && depression < 3
  if (noAnxietyDepression) return keys
  if (sleepComplaint) keys.add('ISI')
  if (somaticCriteria) keys.add('HADS')
  if (anxiety >= 3 && anxiety > depression) keys.add('GAD7')
  if (depression >= 3 && depression > anxiety) keys.add('PHQ9')
  if (anxiety >= 3 && anxiety === depression) keys.add('HADS')
  return keys
}
