// ─────────────────────────────────────────────────────────────
// Экспорт записи приёма: JSON-файл, печатная версия (PDF/печать)
// и письмо в почтовом клиенте. Перенесено из DoctorView.vue:
// компонент собирает данные (buildVisitExport), а этот сервис
// отвечает за способ доставки (Blob, print-window, mailto).
// ─────────────────────────────────────────────────────────────

/** Печатное представление одного значения поля экспорта. */
function fmt(v: unknown): string {
  return Array.isArray(v) ? (v.length ? v.join(', ') : '—') : String(v ?? '—') || '—'
}

/**
 * JSON: скачать файл с записью приёма.
 * Возвращает сообщение об успехе для отображения в UI.
 */
export function exportVisitJson(data: unknown, fileName: string): string {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return 'Запись экспортирована в JSON ✓'
}

/**
 * PDF / Печать: открыть печатную версию записи и вызвать диалог печати
 * (можно сохранить как PDF). Возвращает сообщение для UI.
 */
export function exportVisitPdf(data: VisitExportData): string {
  const w = window.open('', '_blank')
  if (!w) {
    return 'Не удалось открыть окно печати — разрешите всплывающие окна.'
  }
  const d = data
  const row = (k: string, v: unknown) => `<tr><th>${k}</th><td>${fmt(v)}</td></tr>`
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
    <title>Приём ${d.пациент} — ${d.дата_приёма}</title>
    <style>
      body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; color: #0f172a; }
      h1 { font-size: 20px; } h2 { font-size: 15px; margin: 18px 0 6px; color: #4f46e5; }
      table { border-collapse: collapse; width: 100%; font-size: 13px; }
      th { text-align: left; width: 220px; color: #64748b; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 10px; vertical-align: top; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>📋 Приём: ${d.пациент}</h1>
    <table>
      ${row('Дата приёма', d.дата_приёма)}${row('Врач', d.врач)}${row('Дата рождения', d.дата_рождения)}
    </table>
    <h2>Жалобы и анамнез</h2>
    <table>
      ${row('Жалобы', d.жалобы)}${row('Критерии ГТР', d.критерии_ГТР)}
      ${row('Анамнез заболевания', d.анамнез_заболевания)}${row('Факторы анамнеза', d.факторы_анамнеза)}
      ${row('Длительность симптомов', d.длительность_симптомов)}
    </table>
    <h2>Анамнез жизни</h2>
    <table>
      ${row('Хронические заболевания', d.анамнез_жизни.хронические)}
      ${row('Аллергии', d.анамнез_жизни.аллергии)}
      ${row('Принимаемые препараты', d.анамнез_жизни.препараты)}
      ${row('Операции и травмы', d.анамнез_жизни.операции_травмы)}
      ${row('Гемотрансфузии', d.анамнез_жизни.гемотрансфузии)}
    </table>
    <h2>Диагноз и дообследование</h2>
    <table>
      ${row('Диагноз', d.диагноз)}${row('Код МКБ-10', d.код_МКБ10)}${row('Дообследование', d.дообследование)}
    </table>
    <h2>Лечение</h2>
    <table>
      ${row('Этап', d.лечение.этап)}${row('Препарат', d.лечение.препарат)}${row('Доза', d.лечение.доза)}
      ${row('Авиандр (малитупердин)', d.лечение.авиандр)}
      ${row('Немедикаментозная терапия', d.лечение.немедикаментозная_терапия)}
      ${row('Консультации специалистов', d.лечение.консультации_специалистов)}
    </table>
    <h2>Результаты тестов</h2>
    <table><tr><th>Дата</th><th>Шкала</th><th>Балл</th></tr>
      ${(d.результаты_тестов as Array<{ дата: string; шкала: string; балл: number }>)
        .map((t) => `<tr><td>${t.дата}</td><td>${t.шкала}</td><td>${t.балл}</td></tr>`).join('')}
    </table>
    <script>window.onload = () => setTimeout(() => window.print(), 300)<\/script>
    </body></html>`)
  w.document.close()
  return 'Печатная версия открыта — можно распечатать или сохранить как PDF ✓'
}

/**
 * Email: открыть почтовый клиент с текстом записи (mailto).
 * Возвращает сообщение для UI.
 */
export function exportVisitEmail(data: VisitExportData): string {
  const d = data
  const line = (k: string, v: unknown) => `${k}: ${fmt(v)}\n`
  const body = [
    line('Пациент', d.пациент),
    line('Дата приёма', d.дата_приёма),
    line('Врач', d.врач),
    '',
    '— Жалобы и анамнез —',
    line('Жалобы', d.жалобы),
    line('Критерии ГТР', d.критерии_ГТР),
    line('Анамнез заболевания', d.анамнез_заболевания),
    line('Длительность симптомов', d.длительность_симптомов),
    '',
    '— Диагноз —',
    line('Диагноз', d.диагноз),
    line('Код МКБ-10', d.код_МКБ10),
    '',
    '— Лечение —',
    line('Препарат', d.лечение.препарат),
    line('Доза', d.лечение.доза),
    line('Авиандр (малитупердин)', d.лечение.авиандр),
    line('Консультации специалистов', d.лечение.консультации_специалистов),
  ].join('\n')
  const subject = `Приём ${d.пациент} — ${d.дата_приёма}`
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return 'Открываю почтовый клиент с текстом записи ✓'
}

// Форма экспортируемых данных (структура buildVisitExport в DoctorView)
export interface VisitExportData {
  пациент: string
  дата_рождения: string
  врач: string
  дата_приёма: string
  жалобы: string | string[]
  критерии_ГТР: string[]
  анамнез_заболевания: string
  факторы_анамнеза: string[]
  длительность_симптомов: string
  анамнез_жизни: {
    хронические: string
    аллергии: string
    препараты: string
    операции_травмы: string
    гемотрансфузии: string
    факторы: string[]
  }
  статус: Record<string, unknown>
  диагноз: string
  код_МКБ10: string
  дообследование: string[]
  лечение: {
    этап: string
    препарат: string
    доза: string
    /** Назначение авиандра: дозировка из справочника DRUG_INFO либо '—' (не назначен) */
    авиандр: string
    немедикаментозная_терапия: string[]
    консультации_специалистов: string[]
    циклы: unknown[]
  }
  результаты_тестов: Array<{ дата: string; шкала: string; балл: number }>
}
