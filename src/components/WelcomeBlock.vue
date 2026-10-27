<template>
  <!--
    WelcomeBlock: приветственный блок главной страницы.
    Содержимое берётся из src/content/welcome.md — правьте текст там,
    он подхватится автоматически (при dev-сервере — с горячей перезагрузкой).
    Поддерживается упрощённый Markdown: # / ## заголовки, - списки,
    **жирный**, *курсив*, [ссылки](URL), --- разделитель, абзацы.
  -->
  <section class="card welcome-block" v-html="rendered"></section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
// ?raw — Vite отдаёт содержимое файла как строку (не собирает модуль)
import welcomeRaw from '../content/welcome.md?raw'

/** Экранирование HTML в исходном тексте (безопасность: v-html ниже) */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Инлайновая разметка: **жирный**, *курсив*, `код`, [текст](URL) */
function inline(s: string): string {
  let out = escapeHtml(s)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  out = out.replace(/\*([^*]+)\*/g, '<i>$1</i>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  return out
}

/**
 * Упрощённый Markdown → HTML.
 * Достаточно для приветственного текста; полноценные парсеры не подключаем,
 * чтобы не тянуть зависимости ради статичной страницы.
 */
function mdToHtml(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let listOpen = false
  let skipMeta = true // строки до первого `---` — служебная инструкция для редактора

  const closeList = () => { if (listOpen) { html.push('</ul>'); listOpen = false } }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (skipMeta) {
      if (/^---+$/.test(line.trim())) { skipMeta = false; closeList(); html.push('<hr>') }
      continue
    }

    if (!line.trim()) { closeList(); continue }

    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      closeList()
      const level = h[1].length
      html.push(`<h${level}>${inline(h[2])}</h${level}>`)
      continue
    }

    if (/^---+$/.test(line.trim())) { closeList(); html.push('<hr>'); continue }

    const li = line.match(/^[-*]\s+(.*)$/)
    if (li) {
      if (!listOpen) { html.push('<ul>'); listOpen = true }
      html.push(`<li>${inline(li[1])}</li>`)
      continue
    }

    closeList()
    html.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  return html.join('\n')
}

const rendered = computed(() => mdToHtml(welcomeRaw))
</script>
