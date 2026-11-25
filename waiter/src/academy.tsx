import { ArrowRight, Award, Coffee, Printer } from 'lucide-react'
import { guestCount, linesOf, shared, type Message, type Workspace } from './domain'
import { useDirectory } from './directory'
import { person, seedWorkspace } from './fixtures'
import { asset, Avatar, Brand, Button } from './ui'

export interface CertificateData { token: string; at: number; score: number; version: string }
export interface AcademyState {
  stage: 'welcome' | 'profile' | 'branch' | 'sasha' | 'lesson' | 'exam' | 'certificate' | 'work'
  actor: string; branch: string; step: number; flow?: number; sandbox?: Workspace; blocked?: boolean
  certificate?: CertificateData; trainingMessages?: Record<string, Message[]>; practiceOrder?: string
}
export const initialAcademy: AcademyState = { stage: 'welcome', actor: '', branch: 'center', step: 0 }
export const greeting = 'Привет! Я Саша. Мы пройдём путь от открытия стола до выдачи. Все учебные действия останутся в песочнице.'
export const lessonNames = ['Ориентация в смене', 'Открытие стола', 'Приём заказа', 'Отправка и выдача', 'Стоп-лист', 'Команда и чаты']
export function freshSandbox() {
  const data = seedWorkspace(Date.now(), false)
  data.stock['d7-1'] = { count: 0, reason: 'Учебный стоп-лист', version: 1, generation: 'training' }
  data.stock['d7-0'] = { count: 3, reason: 'Учебный остаток', version: 1, generation: 'training' }
  return data
}
export function migrateAcademy(state: AcademyState): AcademyState {
  if (!['lesson', 'exam'].includes(state.stage) || state.flow === 2) return state
  const workspace = state.sandbox ?? freshSandbox()
  const order = Object.values(workspace.active)[0] ?? Object.values(workspace.archived)[0]
  const lines = order ? linesOf(order) : []
  const step = state.step < 2 ? 0 : !order ? 1 : !lines.some(line => line.guest !== shared) ? 2 :
    !lines.some(line => line.status === 'served') ? 3 : state.step > 15 ? 5 : 4
  return { ...state, sandbox: workspace, flow: 2, step, practiceOrder: order?.id }
}
export function examErrors(data: Workspace, blocked: boolean) {
  const order = Object.values(data.archived)[0] ?? Object.values(data.active)[0]
  const lines = order ? linesOf(order) : []
  return [
    [order && guestCount(order) >= 2, 'Откройте учебный стол минимум для двух гостей.'],
    [new Set(lines.map(line => line.guest).filter(key => key !== shared)).size >= 2, 'Добавьте блюда двум разным гостям.'],
    [lines.some(line => line.guest === shared), 'Добавьте позицию на общий стол.'],
    [lines.some(line => line.modifiers), 'Сохраните модификатор в позиции.'],
    [lines.some(line => line.note) || order?.note, 'Сохраните комментарий.'],
    [blocked, 'Проверьте недоступное блюдо в меню.'],
    [lines.length > 0 && lines.every(line => line.status === 'served'), 'Отметьте выдачу всех блюд.'],
    [order?.state === 'closed', 'Проведите тестовый расчёт и завершите заказ.']
  ].filter(([pass]) => !pass).map(([, message]) => String(message))
}

export function Certificate({ actor, certificate }: { actor: string; certificate: CertificateData }) {
  const directory = useDirectory()
  return <section className="certificate stack">
    <Award size={32} style={{ marginInline: 'auto' }}/>
    <h2>{directory.training?.title ?? 'COFFEEMAN Academy'}</h2><h1>Сертификат</h1><strong>{directory.person(actor)?.name ?? person(actor).name}</strong>
    <p>Практический экзамен · {certificate.score}%</p>
    <small>{new Date(certificate.at).toLocaleDateString('ru-RU')} · программа {certificate.version}</small>
    <small>{certificate.token}</small>
    <small>Внутренний демонстрационный документ</small>
    <div><Button onClick={() => window.print()}><Printer size={17}/> Печать / PDF</Button></div>
  </section>
}

export function Academy({ state, change }: { state: AcademyState; change: (next: AcademyState) => void }) {
  const directory = useDirectory()
  return <main className="onboarding">
    <header className="row spread"><Brand/></header>
    <section className="onboarding-card stack">
      {state.stage === 'welcome' && <><img src={asset('icons/app.svg')} width={74} height={74} alt=""/><h1>Добро пожаловать в Waiter</h1><p className="muted">Выберите демонстрационный профиль и подготовьтесь к первой смене.</p><Button primary onClick={() => change({ ...state, stage: 'profile' })}>Начать <ArrowRight size={17}/></Button></>}
      {state.stage === 'profile' && <><h1>Выберите профиль</h1><p className="muted">Демонстрационные сотрудники</p><div className="stack">
        {directory.staff.filter(item => !item.disabled).map(item => <button className="line-row" key={item.id} onClick={() => change({ ...state, actor: item.id, stage: 'branch' })}><span className="row"><Avatar actor={item.id}/><span><strong>{item.name}</strong><small>{item.role}</small></span></span><ArrowRight size={17}/></button>)}
      </div></>}
      {state.stage === 'branch' && <><h1>В какой кофейне смена?</h1>{directory.branches.filter(item => !item.disabled).map(item => <Button key={item.id} onClick={() => change({ ...state, branch: item.id, stage: state.certificate ? 'work' : 'sasha', step: 0 })}><Coffee size={17}/>{item.name}</Button>)}</>}
      {state.stage === 'sasha' && <><img src={asset('icons/sasha.svg')} className="sasha-avatar" width={88} height={88} alt="Саша"/><h1>Знакомьтесь, Саша</h1><p>{directory.training?.note || greeting}</p><Button primary onClick={() => {
        location.hash = 'hall'
        change({ ...state, stage: 'lesson', step: 0, flow: 2, sandbox: freshSandbox(), blocked: false, trainingMessages: {}, practiceOrder: undefined })
      }}>Начать обучение <ArrowRight size={17}/></Button></>}
      {state.stage === 'certificate' && state.certificate && <><Certificate actor={state.actor} certificate={state.certificate}/><Button primary onClick={() => { location.hash = 'hall'; change({ ...state, stage: 'work', sandbox: undefined, trainingMessages: undefined }) }}>Открыть рабочий интерфейс</Button></>}
    </section>
  </main>
}
