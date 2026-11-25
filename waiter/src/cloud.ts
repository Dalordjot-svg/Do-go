const databaseURL = import.meta.env.VITE_WAITER_FIREBASE_DATABASE_URL?.trim()
export const cloudProject = import.meta.env.VITE_WAITER_FIREBASE_PROJECT_ID?.trim()
export async function probeCloud(signal: AbortSignal) {
  if (!databaseURL || !cloudProject) return ''
  const url = new URL(databaseURL)
  if (url.protocol !== 'https:' || !/(\.firebaseio\.com|\.firebasedatabase\.app)$/.test(url.hostname)) throw new Error('Укажите HTTPS-адрес Firebase Realtime Database')
  const response = await fetch(new URL('/coffeemanWaiter/workspaces/center.json?shallow=true', url), { signal, cache: 'no-store' })
  if (response.status === 423) return 'Облачная RTDB деактивирована (HTTP 423).'
  if (response.status === 401 || response.status === 403) return 'Облачная RTDB требует доступа.'
  if (!response.ok) return `Облачная RTDB недоступна (HTTP ${response.status}).`
  return 'Облачная RTDB отвечает на запрос чтения. Рабочая синхронизация использует выбранную тестовую среду.'
}
