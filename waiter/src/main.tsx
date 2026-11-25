import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Academy, initialAcademy, migrateAcademy, type AcademyState } from './academy'
import { Installation, useInstallation } from './installation'
import { local, save, setting, watchRegistry } from './storage'
import { Brand } from './ui'
import { Directory, getDirectory } from './directory'
import type { Workspace } from './domain'
import './styles.css'
import './ios.css'

const Work = lazy(() => import('./workspace'))
type Theme = 'light' | 'dark' | 'system'
function Entry() {
  const [state, setState] = useState<AcademyState>()
  const [theme, setTheme] = useState<Theme>('dark')
  const [registry, setRegistry] = useState<Workspace>()
  useEffect(() => watchRegistry(setRegistry), [])
  const [error, setError] = useState('')
  useEffect(() => {
    void Promise.all([setting('academy', initialAcademy), setting<Theme>('theme', 'dark')]).then(([state, theme]) => {
      setState(migrateAcademy(state)); setTheme(theme)
    }).catch(() => setError('Хранилище устройства недоступно. Разрешите сохранение данных для этого сайта.'))
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const preferred = matchMedia('(prefers-color-scheme: dark)')
    const change = () => document.querySelector('meta[name="theme-color"]')?.setAttribute('content', (theme === 'dark' || theme === 'system' && preferred.matches) ? '#09090B' : '#F2F2F7')
    change()
    preferred.addEventListener('change', change)
    return () => preferred.removeEventListener('change', change)
  }, [theme])
  function persist(next: AcademyState) {
    setState(next)
    const rows = [{ key: 'academy', value: next }]
    if (next.actor) rows.push({ key: 'academy:' + next.actor, value: next })
    void local.settings.bulkPut(rows).catch(() => setError('Не удалось сохранить прогресс на устройстве.'))
  }
  function change(next: AcademyState) {
    if (next.stage === 'branch' && next.actor) {
      void setting('academy:' + next.actor, next).then(saved => {
        const location = getDirectory(saved.branch, {}, registry).branches.find(branch => branch.id === saved.branch)
        persist(location?.disabled ? next : saved)
      }).catch(() => setError('Не удалось открыть профиль.'))
    } else persist(next)
  }
  if (error || !state) return <main className="onboarding stack"><Brand/><p role="status">{error || 'Подготовка рабочего места…'}</p></main>
  const directory = getDirectory(state.branch, {}, registry)
  const disabled = directory.person(state.actor)?.disabled
  const branchDisabled = state.stage === 'work' && directory.branches.find(branch => branch.id === state.branch)?.disabled
  if (disabled || branchDisabled || !['work', 'lesson', 'exam'].includes(state.stage) || state.stage === 'work' && !state.certificate) {
    return <Directory.Provider value={directory}><Academy state={disabled ? { ...initialAcademy, stage: 'profile' } : branchDisabled ? { ...state, stage: 'branch' } : state.stage === 'work' ? initialAcademy : state} change={change}/></Directory.Provider>
  }
  return <Suspense fallback={<main className="onboarding"><Brand/><p>Открываем зал…</p></main>}>
    <Work key={state.branch + Number(state.stage !== 'work')} account={state} registry={registry} change={change} theme={theme} themeChange={value => { setTheme(value); void save('theme', value) }}
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
