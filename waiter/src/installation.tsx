import { useEffect, useState } from 'react'
import { ArrowDownToLine, Check, ChevronRight, Coffee, Monitor, Share, Smartphone, WifiOff } from 'lucide-react'
import { asset, Brand, Button } from './ui'
interface Prompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
const display = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
export function useInstallation() {
  const [standalone, setStandalone] = useState(display)
  const [prompt, setPrompt] = useState<Prompt>()
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const accept = (event: Event) => { event.preventDefault(); setPrompt(event as Prompt) }
    const applied = () => { setInstalled(true); setPrompt(undefined); setStandalone(display()) }
    const mode = matchMedia('(display-mode: standalone)')
    const overlay = matchMedia('(display-mode: window-controls-overlay)')
    addEventListener('beforeinstallprompt', accept)
    addEventListener('appinstalled', applied)
    mode.addEventListener('change', applied)
    overlay.addEventListener('change', applied)
    return () => {
      removeEventListener('beforeinstallprompt', accept)
      removeEventListener('appinstalled', applied)
      mode.removeEventListener('change', applied)
      overlay.removeEventListener('change', applied)
    }
  }, [])
  return { standalone, prompt, installed, install: async () => {
    if (!prompt) return
    setPrompt(undefined)
    await prompt.prompt()
    setInstalled((await prompt.userChoice).outcome === 'accepted')
  } }
}
function platform() {
  const agent = navigator.userAgent
  if (/iPad/i.test(agent) || (/Mac/i.test(agent) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/iPhone|iPod/i.test(agent)) return 'iPhone'
  if (/Android/i.test(agent)) return 'Android'
  if (/Windows/i.test(agent)) return 'Windows'
  if (/Mac/i.test(agent)) return 'macOS'
  return 'Другие платформы'
}
export function Installation({ state, enterDev }: { state: ReturnType<typeof useInstallation>; enterDev: () => void }) {
  const device = platform()
  const ios = device === 'iPhone' || device === 'iPad'
  const steps = ios
    ? ['Откройте сайт в Safari и нажмите «Поделиться».', 'Выберите «На экран Домой».', 'Нажмите «Добавить».', 'Откройте Waiter с домашнего экрана.']
    : device === 'macOS' ? ['Откройте сайт в Chrome, Edge или Safari 17+.', 'Выберите «Установить приложение» или «Добавить в Dock» в Safari.', 'Запустите Waiter через созданную иконку.']
      : ['Откройте эту страницу в актуальном Chrome или Edge.', 'В меню браузера выберите «Установить приложение».', 'Запустите Waiter через созданную иконку.']
  const [error, setError] = useState('')
  return <main className="install-page">
    <header className="install-top"><Brand/><span className="demo-badge">Тестовый режим</span></header>
    <div className="install-grid">
      <section className="install-hero">
        <img src={asset('icons/app.svg')} alt="Иконка COFFEEMAN Waiter" width={96} height={96}/>
        <h1>Зал под рукой.</h1>
        <p>Столы, заказы и команда кофейни в одном приложении.</p>
        <div className="install-perks"><span><Coffee size={17}/> Быстрые заказы</span><span><WifiOff size={17}/> Работа без сети</span></div>
      </section>
      <section className="panel install-card">
        <div className="device-label">{ios || device === 'Android' ? <Smartphone size={18}/> : <Monitor size={18}/>} {device}</div>
        <h2>Установите Waiter</h2>
        <p className="muted">После установки запустите приложение через его иконку.</p>
        {state.installed && <div className="callout"><Check size={18}/> Откройте Waiter через иконку приложения.</div>}
        {state.prompt && <Button primary onClick={() => { void state.install().catch(() => setError('Откройте меню браузера и выберите установку.')) }}><ArrowDownToLine size={18}/> Установить приложение</Button>}
        {error && <p role="alert">{error}</p>}
        <ol className="steps">{steps.map((step, index) => <li key={step}><span>{index === 0 && ios ? <Share size={16}/> : index + 1}</span>{step}</li>)}</ol>
        {import.meta.env.DEV && <Button onClick={enterDev}>Открыть в режиме разработки <ChevronRight size={16}/></Button>}
      </section>
    </div>
  </main>
}
