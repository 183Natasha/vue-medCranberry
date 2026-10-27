import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadAppConfig, logSettings } from './services/app-config'
import { flushToFile, preloadClientIp } from './services/audit'
import './assets/main.css'

async function bootstrap(): Promise<void> {
  // Базовый конфиг (settings.yaml) грузим ДО монтирования:
  // аудит-лог уже знает режим работы (enabled / localstorage | file).
  // IP клиента запрашиваем параллельно — успеет до первых событий.
  preloadClientIp()
  await loadAppConfig()

  const app = createApp(App)
  app.use(router)
  await router.isReady()
  app.mount('#app')

  // Если режим file — досылаем батч, который мог накопиться до загрузки
  if (logSettings().mode === 'file') flushToFile()
}

bootstrap()
