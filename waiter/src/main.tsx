import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Academy, initialAcademy, type AcademyState } from './academy'
import { Installation, useInstallation } from './installation'
import { save, setting } from './storage'
import { Brand } from './ui'
import './styles.css'

const Work = lazy(() => import('./workspace'))
type Theme = 'light' | 'dark' | 'system'
function Entry() {
  const [state, setState] = useState<AcademyState>()
  const [theme, setTheme] = useState<Theme>('system')
  const [error, setError] = useState('')
  useEffect(() => {
    void Promise.all([setting('academy', initialAcademy), setting<Theme>('theme', 'system')]).then(([state, theme]) => {
      setState(state); setTheme(theme)
    }).catch(() => setError('Хранилище устройства недоступно. Разрешите сохранение данных для этого сайта.'))
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const preferred = matchMedia('(prefers-color-scheme: dark)')
    const change = () => document.querySelector('meta[name="theme-color"]')?.setAttribute('content', (theme === 'dark' || theme === 'system' && preferred.matches) ? '#171d19' : '#f6f7f2')
    change()
    preferred.addEventListener('change', change)
    return () => preferred.removeEventListener('change', change)
  }, [theme])
  function change(next: AcademyState) {
    setState(next)
    void save('academy', next).catch(() => setError('Не удалось сохранить прогресс на устройстве.'))
  }
  if (error || !state) return <main className="onboarding stack"><Brand/><p role="status">{error || 'Подготовка рабочего места…'}</p></main>
  if (state.stage !== 'work' || !state.certificate) return <Academy state={state.stage === 'work' ? initialAcademy : state} change={change}/>
  return <Suspense fallback={<main className="onboarding"><Brand/><p>Открываем зал…</p></main>}>
    <Work key={state.branch} account={state} change={change} theme={theme} themeChange={value => { setTheme(value); void save('theme', value) }}
      signOut={() => change({ ...initialAcademy, stage: 'profile' })} training={() => change({ ...state, stage: 'sasha', step: 0, sandbox: undefined, blocked: false })}/>
  </Suspense>
}
function App() {
  const installation = useInstallation()
  const [dev, setDev] = useState(() => import.meta.env.DEV && sessionStorage.getItem('waiter-dev-entry') === 'on')
  if (!installation.standalone && !(import.meta.env.DEV && dev)) return <Installation state={installation} enterDev={() => {
    sessionStorage.setItem('waiter-dev-entry', 'on'); setDev(true)
  }}/>
  return <Entry/>
}
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><App/></MotionConfig>)
