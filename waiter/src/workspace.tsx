import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bell, CircleAlert, Coffee, LayoutGrid, ListChecks, MapPin, MessageCircle, Shield, UserRound, Wifi, WifiOff } from 'lucide-react'
import { apply, guestCount, id, linesOf, money, paid, shared, type Command, type ConfigChange, type Link, type Message, type Order, type Workspace } from './domain'
import { person, sampleMessages } from './fixtures'
import { Directory, getDirectory, getRegistry } from './directory'
import { backend } from './remote'
import { enqueue, enqueueCertificate, local, registryBranch, runWork, save, setting, useWork, watchRoom } from './storage'
import { Avatar, Button, Chip, Dialog, Empty, ScreenTitle, asset, useClock, useKeyboardViewport } from './ui'
import { Hall } from './hall'
import { Inventory } from './inventory'
import { OpenTable, OrderEditor, Orders, type Dispatch } from './orders'
import { getAlerts } from './alerts'
import { cloudProject, probeCloud } from './cloud'
import { Certificate, examErrors, freshSandbox, greeting, lessonNames, type AcademyState } from './academy'

import { Coach, type Prompt } from './coach'

const Admin = lazy(() => import('./admin'))
const Chats = lazy(() => import('./chats').then(module => ({ default: module.Chats })))
const Developer = import.meta.env.DEV ? lazy(() => import('./dev-panel')) : null
const nav = [
  { id: 'hall', title: 'Зал', icon: LayoutGrid },
  { id: 'orders', title: 'Заказы', icon: ListChecks },
  { id: 'stop-list', title: 'Стоп-лист', icon: CircleAlert },
  { id: 'chats', title: 'Чаты', icon: MessageCircle },
  { id: 'profile', title: 'Профиль', icon: UserRound }
] as const
type Page = typeof nav[number]['id']
type Theme = 'light' | 'dark' | 'system'
const currentPage = (): Page => nav.find(section => '#' + section.id === location.hash)?.id ?? 'hall'
const go = (page: Page) => { location.hash = page }

export default function Work({ account, registry, change, theme, themeChange, signOut, training }: {
  account: AcademyState; registry?: Workspace; change: (value: AcademyState) => void; theme: Theme; themeChange: (theme: Theme) => void; signOut: () => void; training: () => void
}) {
  const shell = useKeyboardViewport()
  const { actor, branch } = account
  const sandbox = account.stage === 'lesson' || account.stage === 'exam'
  const exam = account.stage === 'exam'
  const academyRef = useRef(account)
  academyRef.current = account
  const [feedback, setFeedback] = useState<string[]>([])
  const [admin, setAdmin] = useState(false)
  const [messagesSeed] = useState(() => ({ general: sampleMessages('general') }))
  const [defaultSandbox] = useState(freshSandbox)
  const clock = useClock()
  const [simulateDelay, setSimulateDelay] = useState(false)
  const now = clock + (simulateDelay ? 25 * 60000 : 0)
  const syncedData = useWork(state => state.workspace)
  const workQueue = useWork(state => state.queue)
  const data = sandbox ? account.sandbox ?? defaultSandbox : syncedData
  const queue = sandbox ? [] : workQueue
  const directory = useMemo(() => getDirectory(branch, data, registry), [branch, data.config, registry])
  const people = useMemo(() => getRegistry(registry?.config).staff, [registry?.config?.staff])
  const online = useWork(state => state.online)
  const busy = useWork(state => state.busy)
  const syncError = useWork(state => state.error)
  const [uiError, setUiError] = useState('')
  const [page, setPage] = useState(currentPage)
  const [visited, setVisited] = useState<Page[]>([page])
  const [map, setMap] = useState<'map' | 'list'>('map')
  const [selected, select] = useState<Link | undefined>(() => sandbox && account.practiceOrder ? { kind: 'order', key: account.practiceOrder } : undefined)
  const [notice, setNotice] = useState(false)
  const [help, setHelp] = useState(false)
  const [read, setRead] = useState<Record<string, boolean>>({})
  const [notify, setNotify] = useState(true)
  const [favorites, setFavorites] = useState<string[]>([])
  const [chat, setChat] = useState('general')
  const [workingMessages, setLoaded] = useState<Record<string, Message[]>>({})
  const [chatRead, setChatRead] = useState<Record<string, number>>({})
  const [successor, setSuccessor] = useState('')
  const [cloudStatus, setCloudStatus] = useState('')
  const prefs = `${actor}:${branch}`
  const user = directory.person(actor) ?? person(actor)
  const canManage = !sandbox && !user.disabled && (user.admin ?? user.role === 'Администратор')
  const loaded = sandbox ? { ...messagesSeed, ...account.trainingMessages } : workingMessages
  useEffect(() => sandbox ? undefined : runWork(branch, actor), [branch, actor, sandbox])
  useEffect(() => {
    if (!sandbox && account.certificate) void enqueueCertificate(actor, account.certificate).catch(error => setUiError(String(error)))
  }, [actor, account.certificate, sandbox])
  function navigate(next: Page) {
    select(undefined); setAdmin(false); setPage(next)
    setVisited(items => items.includes(next) ? items : [...items, next])
    go(next)
    if (sandbox && !exam && account.step === 0 && next === 'orders') change({ ...account, step: 1 })
  }
  useEffect(() => {
    const route = () => { const next = currentPage(); setPage(next); setVisited(items => items.includes(next) ? items : [...items, next]) }
    addEventListener('hashchange', route)
    return () => removeEventListener('hashchange', route)
  }, [])
  useEffect(() => {
    if (sandbox) return
    let alive = true
    void Promise.all([setting<string[]>(`favorites:${actor}`, []), setting<Record<string, boolean>>(`notices:${prefs}`, {}), setting<Record<string, number>>(`read:${prefs}`, {}), setting(`notify:${actor}`, true)]).then(([stars, seen, reads, enabled]) => {
      if (alive) { setFavorites(stars); setRead(seen); setChatRead(reads); setNotify(enabled) }
    }).catch(error => setUiError(String(error)))
    return () => { alive = false }
  }, [actor, prefs, sandbox])
  useEffect(() => {
    if (sandbox) return
    const controller = new AbortController()
    void probeCloud(controller.signal).then(setCloudStatus).catch(error => { if (!controller.signal.aborted) setCloudStatus(String(error)) })
    return () => controller.abort()
  }, [sandbox])
  useEffect(() => {
    if (sandbox) return
    let disposed = false
    let close: (() => void)[] = []
    void import('./chats').then(({ chatRooms }) => {
      if (disposed) return
      close = chatRooms(actor, people).map(item => watchRoom(branch, item.id, messages => setLoaded(prev => ({ ...prev, [item.id]: messages }))))
    })
    return () => { disposed = true; close.forEach(stop => stop()) }
  }, [branch, actor, sandbox, people])
  useEffect(() => {
    const latest = loaded[chat]?.at(-1)?.at
    if (page !== 'chats' || !latest || latest <= (chatRead[chat] ?? 0)) return
    const next = { ...chatRead, [chat]: latest }
    setChatRead(next); if (!sandbox) void save(`read:${prefs}`, next)
  }, [page, chat, loaded, chatRead, prefs, sandbox])
  function resetPractice(stage = account.stage) {
    setFeedback([]); select(undefined); setPage('hall'); go('hall')
    change({ ...academyRef.current, stage, step: 0, flow: 2, sandbox: freshSandbox(), trainingMessages: {}, practiceOrder: undefined, blocked: false })
  }
  const dispatch: Dispatch = async (command: Command) => {
    setUiError('')
    if (sandbox) {
      const state = academyRef.current
      if (command.type === 'open' && (!exam && state.step !== 1 || Object.keys(state.sandbox?.active ?? {}).length || Object.keys(state.sandbox?.archived ?? {}).length)) {
        setFeedback(['Продолжите текущий учебный сценарий.']); return
      }
      if (!exam && state.step === 1 && command.type === 'open' && Object.keys(command.guests).length < 2) {
        setFeedback(['Укажите минимум двух гостей.']); return
      }
      const at = Date.now(), operation = id()
      const result = apply(state.sandbox ?? defaultSandbox, { id: operation, command, actor, at, branch: 'training' }, at)
      if (result.error) { setFeedback([result.error]); return }
      const next = { ...state, sandbox: result.state }
      if (command.type === 'open') next.practiceOrder = command.order
      if (command.type === 'message') next.trainingMessages = { ...state.trainingMessages,
        [command.chat]: [...(state.trainingMessages?.[command.chat] ?? (command.chat === 'general' ? messagesSeed.general : [])), command.message] }
      if (!exam && (
        state.step === 1 && command.type === 'open' ||
        state.step === 2 && command.type === 'add' && command.line.guest !== shared ||
        state.step === 3 && command.type === 'status' && command.status === 'served' ||
        state.step === 4 && command.type === 'stock'
      )) next.step++
      if (!exam && state.step === 5 && command.type === 'message') { resetPractice('exam'); return operation }
      academyRef.current = next
      setFeedback([]); change(next)
      return operation
    }
    try {
      const operation = await enqueue(branch, actor, command)
      navigator.vibrate?.(9)
      return operation
    } catch (error) { setUiError(String(error)); return undefined }
  }
  const toggle = (key: string) => {
    const next = favorites.includes(key) ? favorites.filter(value => value !== key) : [...favorites, key]
    setFavorites(next)
    if (!sandbox) void save(`favorites:${actor}`, next)
  }
  const openTable = (key: string) => select({ kind: 'table', key })
  const openOrder = (order: Order) => select({ kind: 'order', key: order.id })
  const orderKey = selected?.kind === 'table' ? data.occupied[selected.key] : selected?.kind === 'order' ? selected.key : ''
  const current = data.active[orderKey] ?? data.archived[orderKey]
  useEffect(() => {
    if (selected?.kind === 'table' && orderKey) select({ kind: 'order', key: orderKey })
  }, [selected?.kind, orderKey])
  const currentDish = selected?.kind === 'dish' ? directory.catalog.find(item => item.id === selected.key) : undefined
  const pending = queue.filter(row => !row.rejected)
  const rejected = queue.filter(row => row.rejected)
  const alerts = getAlerts(data, actor, now, queue, loaded, directory)
  const unread = alerts.filter(item => !read[item.id]).length
  const unreadMessages = Object.entries(loaded).reduce((sum, [room, messages]) => sum + messages.filter(message => message.actor !== actor && message.at > (chatRead[room] ?? 0)).length, 0)
  const orderAlerts = alerts.filter(item => item.link?.kind === 'order' && !read[item.id]).length
  const stockAlerts = alerts.filter(item => item.link?.kind === 'dish' && !read[item.id]).length
  const mine = Object.values(data.active).filter(order => order.owner === actor)
  const archive = Object.values(data.archived).filter(order => order.state === 'closed' && order.owner === actor)
  const income = archive.reduce((sum, order) => sum + paid(order), 0)
  const guests = archive.reduce((sum, order) => sum + guestCount(order), 0)
  const source = backend === 'emulator' ? 'Firebase Emulator' : 'Данные на устройстве'
  const status = !online ? 'Нет соединения' : busy ? 'Синхронизация' : rejected.length ? 'Конфликт данных' : syncError ? 'Ошибка' : pending.length ? 'Ожидает отправки' : backend === 'emulator' ? 'Синхронизировано' : 'Локальный режим'
  const step = Math.min(account.step, lessonNames.length - 1)
  const practice = account.practiceOrder ? data.active[account.practiceOrder] : undefined
  const lines = practice ? linesOf(practice) : []
  const prompts: Prompt[] = [
    { target: 'orders-tab', text: 'Откройте вкладку «Заказы». Здесь собраны заказы всей смены.' },
    page !== 'hall' ? { target: 'hall-tab', text: 'Вернитесь в зал, чтобы открыть учебный стол.' } :
      selected ? { target: 'open-submit', text: 'Укажите минимум двух гостей и откройте стол.' } :
        { target: 'table', text: 'Нажмите на свободный стол и начните обслуживание.' },
    { target: 'popular|add-menu', text: 'Откройте меню, выберите гостя и добавьте ему блюдо.' },
    lines.some(line => line.status === 'draft') ? { target: 'send', text: 'Подтвердите черновики. Кнопка отправки всегда внизу заказа.' } :
      { target: 'fulfillment|line-actions', text: 'Отметьте блюдо готовым, затем выдайте его гостю.' },
    page !== 'stop-list' || selected ? { target: 'stop-list-tab', text: 'Перейдите в стоп-лист. Учебные остатки изолированы.' } :
      { target: 'stock', text: 'Откройте позицию и сохраните новый остаток или статус наличия.' },
    page !== 'chats' || selected ? { target: 'chats-tab', text: 'Перейдите в чаты, чтобы связаться с командой.' } :
      { target: 'compose', text: 'Отправьте учебное сообщение. Дальше — практический экзамен.' }
  ]
  const hint = directory.training?.instructions?.[step]
  const prompt = hint ? { ...prompts[step], text: `${prompts[step].text} ${hint}` } : prompts[step]
  function verify() {
    const failures = examErrors(data, Boolean(academyRef.current.blocked))
    setFeedback(failures)
    if (failures.length === 0) change({ ...academyRef.current, stage: 'certificate', certificate: {
      token: id(), at: Date.now(), score: 100, version: directory.training?.revision ?? '2.0'
    } })
  }
  function mark(ids: string[]) {
    const next = { ...read, ...Object.fromEntries(ids.map(key => [key, true])) }
    setRead(next); if (!sandbox) void save(`notices:${prefs}`, next)
  }
  async function configure(change: ConfigChange, version: number) {
    setUiError('')
    const branchScoped = ['dish', 'category', 'table'].includes(change.kind)
    try { return await enqueue(branchScoped ? branch : registryBranch, actor, { type: 'configure', change, version }) }
    catch (error) { setUiError(String(error)); return undefined }
  }
  return <Directory.Provider value={directory}><div ref={shell} className={`app-shell ${sandbox ? 'academy-shell' : ''} ${exam ? 'exam-shell' : ''}`}>
    <nav className="app-nav" aria-label="Основные разделы">{nav.map(item => {
      const count = sandbox || !notify ? 0 : item.id === 'chats' ? unreadMessages : item.id === 'orders' ? orderAlerts : item.id === 'stop-list' ? stockAlerts : 0
      return <button data-coach={item.id + '-tab'} key={item.id} aria-label={item.title} aria-description={count > 0 ? `${count} новых событий` : undefined} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
        <span className="tab-glyph"><item.icon size={22}/>{count > 0 && <i aria-hidden="true">{count > 99 ? '99+' : count}</i>}</span><span>{item.title}</span>
      </button>
    })}</nav>
    <main className="workspace-shell">
      <header className="topbar">
        <div className="row work-wordmark"><Coffee size={20}/><strong>{directory.preferences?.name ?? "COFFEEMAN"}</strong><span>{sandbox ? "Песочница" : "WAITER"}</span></div>
        <div className="row"><span className="connection" title={source}>{online ? <Wifi size={16}/> : <WifiOff size={16}/>}<span>{sandbox ? "Учебная смена" : status}</span></span>
          <button className="icon notification-button" aria-label={unread && notify ? `Уведомления: ${unread} непрочитанных` : 'Уведомления'} onClick={() => setNotice(true)}><Bell size={18}/>{notify && unread > 0 && <i/>}</button>
          <button className="avatar-button" aria-label="Профиль" onClick={() => navigate('profile')}><Avatar actor={actor} small/></button>
        </div>
      </header>
      {(!sandbox && (uiError || syncError || rejected.length > 0)) && <div className="callout danger sync-banner" role="status">
        {uiError || rejected[0]?.rejected || syncError}
        {rejected.length > 0 && <button className="text-button" onClick={() => { void local.outbox.delete(rejected[0].id) }}>Скрыть конфликт</button>}
      </div>}
      <div className={`nav-pages ${directory.preferences?.compactOrders ? 'compact-orders' : ''}`}>
        {admin && canManage && <section className="page" hidden={!!selected}><Suspense fallback={<Empty>Открываем управление…</Empty>}><Admin data={data} registry={registry} actor={actor} branch={branch} now={now} order={openOrder} dispatch={dispatch} save={configure} close={() => setAdmin(false)}/></Suspense></section>}
        {visited.map(tab => <section className="page" key={tab} hidden={tab !== page || !!selected || admin}><div className="page-body">
          {tab === 'hall' && <Hall data={data} branch={branch} actor={actor} now={now} open={openTable} mode={map} setMode={setMap} orders={() => navigate('orders')}/>}
          {tab === 'orders' && <Orders data={data} actor={actor} now={now} open={openOrder}/>}
          {tab === 'stop-list' && <Inventory data={data} dispatch={dispatch}/>}
          {tab === 'chats' && <Suspense fallback={<Empty>Загрузка чатов…</Empty>}><Chats actor={actor} branch={branch} data={data} chat={chat} select={setChat} loaded={loaded} read={chatRead} dispatch={dispatch} open={select} sandbox={sandbox}/></Suspense>}
          {tab === 'profile' && <div className="stack">
            <ScreenTitle title="Профиль">Данные смены, настройки и Академия.</ScreenTitle>
            <div className="panel pad row spread wrap"><div className="row"><Avatar actor={actor}/><div><h2>{user.name}</h2><p className="muted">{user.role} · {directory.branches.find(value => value.id === branch)?.name}</p></div></div><Chip tone={online ? 'mine' : 'free'}>{status}</Chip></div>
            {canManage && <button className="line-row admin-launch" onClick={() => setAdmin(true)}><span className="row"><Shield size={20}/> Панель администратора</span><span aria-hidden="true">›</span></button>}
            <div className="profile-grid">{[['Активные столы', mine.length], ['Обслуженные гости', guests], ['Завершённые заказы', archive.length], ['Тестовые продажи', money(income)], ['Средний чек', money(archive.length ? Math.round(income / archive.length) : 0)]].map(([label, value]) => <div className="panel card" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
            {!sandbox && <><section className="panel pad stack">
              <h2>Настройки</h2>
              <div className="form-grid"><label>Тема<select value={theme} onChange={event => themeChange(event.target.value as Theme)}><option value="system">Системная</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>
                <label>Точка<select value={branch} onChange={event => change({ ...account, branch: event.target.value })}>{directory.branches.filter(item => !item.disabled).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
              <label className="row"><input type="checkbox" checked={notify} onChange={event => { setNotify(event.target.checked); void save(`notify:${actor}`, event.target.checked) }}/> Индикатор новых уведомлений</label>
              <p className="muted"><MapPin className="inline" size={15}/> {source}. {cloudProject && `${cloudProject} · ${cloudStatus}`}</p>
            </section>
            <section className="panel pad stack"><h2>Пересменка</h2><label>Передать все мои столы<select value={successor} onChange={event => setSuccessor(event.target.value)}><option value="">Выберите коллегу</option>{directory.staff.filter(item => item.id !== actor && !item.disabled).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button disabled={!successor || !mine.length} onClick={() => { void dispatch({ type: 'transfer', orders: Object.fromEntries(mine.map(order => [order.id, actor])), owner: successor }) }}>Передать · {mine.length}</Button></section>
            {account.certificate && <Certificate actor={actor} certificate={account.certificate}/>}
            <div className="row wrap"><Button onClick={() => setHelp(true)}>Помощь Саши</Button><Button onClick={training}>Повторить обучение</Button><Button onClick={signOut}>Выйти из профиля</Button></div>
            {Developer && <Suspense><Developer data={data} branch={branch} actor={actor} dispatch={dispatch} training={training} delay={() => setSimulateDelay(value => !value)}/></Suspense>}</>}
          </div>}
        </div></section>)}
        {selected && <section className="order-screen" role="dialog" aria-modal="false" aria-labelledby="order-title">
          <header className="order-header row"><button className="icon" aria-label="Закрыть" onClick={() => select(undefined)}><ArrowLeft size={22}/></button>
            <div><small>{current || selected.kind === 'table' ? 'Обслуживание' : 'Справочник'}</small><h1 id="order-title">{current ? `Стол ${directory.table(current.table)}` : selected.kind === 'table' ? `Стол ${directory.table(selected.key)}` : currentDish?.name ?? 'Заказ'}</h1></div>
          </header>
          <div className="order-scroll">
            {current ? <OrderEditor key={current.id} order={current} data={data} actor={actor} now={now} dispatch={dispatch} favorites={favorites} toggle={toggle}
              observeDish={key => { if (exam && data.stock[key]?.count === 0) change({ ...academyRef.current, blocked: true }) }}
              pending={pending.flatMap(({ command }) => 'order' in command && command.order === current.id && ['send', 'status', 'pay', 'close'].includes(command.type) ? [command] : [])}/> :
              selected.kind === 'table' ? <div className="open-table-sheet"><OpenTable key={selected.key} table={selected.key} dispatch={dispatch} pending={pending.some(row => row.command.type === 'open' && row.command.table === selected.key)} done={() => {}}/></div> :
              currentDish ? <div className="stack"><p>{currentDish.description}</p><p>{money(currentDish.price)} · {currentDish.prep} мин · {data.stock[currentDish.id]?.count === 0 ? 'Стоп-лист' : 'В наличии'}</p><p className="muted">{currentDish.allergens}</p><Button onClick={() => navigate('stop-list')}>К стоп-листу</Button></div> : <Empty>Заказ недоступен. Проверьте выбранную точку.</Empty>}
            {(uiError || rejected[0]?.rejected) && <p className="callout danger" role="alert">{uiError || rejected[0].rejected}</p>}
          </div>
        </section>}
      </div>
    </main>
    {sandbox && <Coach prompt={prompt} step={step} exam={exam} errors={feedback} verify={verify} reset={() => resetPractice('exam')} restart={() => resetPractice('lesson')}/>}
    {notice && <Dialog title="Уведомления" close={() => setNotice(false)}>
      <Button disabled={!unread} onClick={() => mark(alerts.map(item => item.id))}>Отметить все прочитанными</Button>
      {alerts.length ? alerts.map(item => <button className="line-row" key={item.id} onClick={() => {
        mark([item.id]); setNotice(false)
        if (item.link) select(item.link)
        if (item.chat) { setChat(item.chat); navigate('chats') }
      }}><span><strong>{item.title}</strong><small>{new Date(item.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></span>
        {!read[item.id] && <Chip tone="ready">Новое</Chip>}</button>) : <Empty>Уведомлений пока нет.</Empty>}
    </Dialog>}
    {help && <Dialog title="Помощь Саши" close={() => setHelp(false)}><img src={asset('icons/sasha.svg')} width={70} height={70} alt="Саша"/><p>{greeting}</p><details><summary>Темы обучения</summary><ol>{lessonNames.map(name => <li key={name}>{name}</li>)}</ol></details><Button onClick={training}>Открыть обучение</Button></Dialog>}
  </div></Directory.Provider>
}
