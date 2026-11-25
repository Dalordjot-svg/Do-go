import { lazy, Suspense, useEffect, useState } from 'react'
import { Bell, CircleAlert, Coffee, LayoutGrid, ListChecks, MapPin, MessageCircle, UserRound, Wifi, WifiOff } from 'lucide-react'
import { guestCount, money, paid, type Command, type Link, type Message, type Order } from './domain'
import { branches, dish, person, staff, tableNumber } from './fixtures'
import { backend } from './remote'
import { enqueue, local, runWork, save, setting, useWork, watchRoom } from './storage'
import { Avatar, Brand, Button, Chip, Dialog, Empty, ScreenTitle, asset, useClock } from './ui'
import { Hall, tableTitle } from './hall'
import { Inventory } from './inventory'
import { OpenTable, OrderEditor, Orders, type Dispatch } from './orders'
import { getAlerts } from './alerts'
import { cloudProject, probeCloud } from './cloud'
import { Certificate, greeting, lessonNames, type AcademyState } from './academy'

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

export default function Work({ account, change, theme, themeChange, signOut, training }: {
  account: AcademyState; change: (value: AcademyState) => void; theme: Theme; themeChange: (theme: Theme) => void; signOut: () => void; training: () => void
}) {
  const { actor, branch } = account
  const now = useClock()
  const data = useWork(state => state.workspace)
  const queue = useWork(state => state.queue)
  const online = useWork(state => state.online)
  const busy = useWork(state => state.busy)
  const syncError = useWork(state => state.error)
  const [uiError, setUiError] = useState('')
  const [page, setPage] = useState(currentPage)
  const [visited, setVisited] = useState<Page[]>([page])
  const [map, setMap] = useState<'map' | 'list'>('map')
  const [selected, select] = useState<Link>()
  const [notice, setNotice] = useState(false)
  const [help, setHelp] = useState(false)
  const [read, setRead] = useState<Record<string, boolean>>({})
  const [notify, setNotify] = useState(true)
  const [favorites, setFavorites] = useState<string[]>([])
  const [chat, setChat] = useState('general')
  const [loaded, setLoaded] = useState<Record<string, Message[]>>({})
  const [chatRead, setChatRead] = useState<Record<string, number>>({})
  const [successor, setSuccessor] = useState('')
  const [cloudStatus, setCloudStatus] = useState('')
  const prefs = `${actor}:${branch}`
  const user = person(actor)
  useEffect(() => runWork(branch, actor), [branch, actor])
  useEffect(() => {
    const route = () => { const next = currentPage(); setPage(next); setVisited(items => items.includes(next) ? items : [...items, next]) }
    addEventListener('hashchange', route)
    return () => removeEventListener('hashchange', route)
  }, [])
  useEffect(() => {
    let alive = true
    void Promise.all([setting<string[]>(`favorites:${actor}`, []), setting<Record<string, boolean>>(`notices:${prefs}`, {}), setting<Record<string, number>>(`read:${prefs}`, {}), setting(`notify:${actor}`, true)]).then(([stars, seen, reads, enabled]) => {
      if (alive) { setFavorites(stars); setRead(seen); setChatRead(reads); setNotify(enabled) }
    }).catch(error => setUiError(String(error)))
    return () => { alive = false }
  }, [actor, prefs])
  useEffect(() => {
    const controller = new AbortController()
    void probeCloud(controller.signal).then(setCloudStatus).catch(error => { if (!controller.signal.aborted) setCloudStatus(String(error)) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    let disposed = false
    let close: (() => void)[] = []
    void import('./chats').then(({ chatRooms }) => {
      if (disposed) return
      close = chatRooms(actor).map(item => watchRoom(branch, item.id, messages => setLoaded(prev => ({ ...prev, [item.id]: messages }))))
    })
    return () => { disposed = true; close.forEach(stop => stop()) }
  }, [branch, actor])
  useEffect(() => {
    const latest = loaded[chat]?.at(-1)?.at
    if (page !== 'chats' || !latest || latest <= (chatRead[chat] ?? 0)) return
    const next = { ...chatRead, [chat]: latest }
    setChatRead(next); void save(`read:${prefs}`, next)
  }, [page, chat, loaded, chatRead, prefs])
  const dispatch: Dispatch = async (command: Command) => {
    setUiError('')
    try {
      const operation = await enqueue(branch, actor, command)
      navigator.vibrate?.(9)
      return operation
    } catch (error) { setUiError(String(error)); return undefined }
  }
  const toggle = (key: string) => {
    const next = favorites.includes(key) ? favorites.filter(value => value !== key) : [...favorites, key]
    setFavorites(next)
    void save(`favorites:${actor}`, next)
  }
  const openTable = (key: string) => select({ kind: 'table', key })
  const openOrder = (order: Order) => select({ kind: 'order', key: order.id })
  const orderKey = selected?.kind === 'table' ? data.occupied[selected.key] : selected?.kind === 'order' ? selected.key : ''
  const current = data.active[orderKey] ?? data.archived[orderKey]
  const currentDish = selected?.kind === 'dish' ? dish(selected.key) : undefined
  const pending = queue.filter(row => !row.rejected)
  const rejected = queue.filter(row => row.rejected)
  const alerts = getAlerts(data, actor, now, queue, loaded)
  const unread = alerts.filter(item => !read[item.id]).length
  const mine = Object.values(data.active).filter(order => order.owner === actor)
  const archive = Object.values(data.archived).filter(order => order.state === 'closed' && order.owner === actor)
  const income = archive.reduce((sum, order) => sum + paid(order), 0)
  const guests = archive.reduce((sum, order) => sum + guestCount(order), 0)
  const source = backend === 'emulator' ? 'Firebase Emulator' : 'Данные на устройстве'
  const status = !online ? 'Нет соединения' : busy ? 'Синхронизация' : rejected.length ? 'Конфликт данных' : syncError ? 'Ошибка' : pending.length ? 'Ожидает отправки' : backend === 'emulator' ? 'Синхронизировано' : 'Локальный режим'
  const tabButtons = nav.map(item => <button key={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => go(item.id)}><item.icon size={19}/><span>{item.title}</span></button>)
  function mark(ids: string[]) {
    const next = { ...read, ...Object.fromEntries(ids.map(key => [key, true])) }
    setRead(next); void save(`notices:${prefs}`, next)
  }
  return <div className="app-shell">
    <aside className="sidebar"><Brand/><nav className="app-nav" aria-label="Основные разделы">{tabButtons}</nav><button className="side-profile row" onClick={() => go('profile')}><Avatar actor={actor}/><span><strong>{user.name}</strong><small>{user.role}</small></span></button></aside>
    <main className="workspace-shell">
      <header className="topbar">
        <div className="row"><Coffee size={17}/><strong>Рабочая смена</strong><span className="demo-badge">Тестовый режим</span></div>
        <div className="row"><span className="connection" title={source}>{online ? <Wifi size={16}/> : <WifiOff size={16}/>}<span>{status}</span></span>
          <button className="icon notification-button" aria-label={unread && notify ? `Уведомления: ${unread} непрочитанных` : 'Уведомления'} onClick={() => setNotice(true)}><Bell size={18}/>{notify && unread > 0 && <i/>}</button>
          <button aria-label="Профиль" onClick={() => go('profile')}><Avatar actor={actor} small/></button>
        </div>
      </header>
      {(uiError || syncError || rejected.length > 0) && <div className="callout danger sync-banner" role="status">
        {uiError || rejected[0]?.rejected || syncError}
        {rejected.length > 0 && <button className="text-button" onClick={() => { void local.outbox.delete(rejected[0].id) }}>Скрыть конфликт</button>}
      </div>}
      <div className="nav-pages">
        {visited.map(tab => <section className="page" key={tab} hidden={tab !== page}><div className="page-body">
          {tab === 'hall' && <Hall data={data} branch={branch} actor={actor} now={now} open={openTable} mode={map} setMode={setMap} orders={() => go('orders')}/>}
          {tab === 'orders' && <Orders data={data} actor={actor} now={now} open={openOrder}/>}
          {tab === 'stop-list' && <Inventory data={data} dispatch={dispatch}/>}
          {tab === 'chats' && <Suspense fallback={<Empty>Загрузка чатов…</Empty>}><Chats actor={actor} branch={branch} data={data} chat={chat} select={setChat} loaded={loaded} read={chatRead} dispatch={dispatch} open={select}/></Suspense>}
          {tab === 'profile' && <div className="stack">
            <ScreenTitle title="Профиль">Данные смены, настройки и Академия.</ScreenTitle>
            <div className="panel pad row spread wrap"><div className="row"><Avatar actor={actor}/><div><h2>{user.name}</h2><p className="muted">{user.role} · {branches.find(value => value.id === branch)?.name}</p></div></div><Chip tone={online ? 'mine' : 'free'}>{status}</Chip></div>
            <div className="profile-grid">{[['Активные столы', mine.length], ['Обслуженные гости', guests], ['Завершённые заказы', archive.length], ['Тестовые продажи', money(income)], ['Средний чек', money(archive.length ? Math.round(income / archive.length) : 0)]].map(([label, value]) => <div className="panel card" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
            <section className="panel pad stack">
              <h2>Настройки</h2>
              <div className="form-grid"><label>Тема<select value={theme} onChange={event => themeChange(event.target.value as Theme)}><option value="system">Системная</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>
                <label>Точка<select value={branch} onChange={event => change({ ...account, branch: event.target.value })}>{branches.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
              <label className="row"><input type="checkbox" checked={notify} onChange={event => { setNotify(event.target.checked); void save(`notify:${actor}`, event.target.checked) }}/> Индикатор новых уведомлений</label>
              <p className="muted"><MapPin className="inline" size={15}/> {source}. {cloudProject && `${cloudProject} · ${cloudStatus}`}</p>
            </section>
            <section className="panel pad stack"><h2>Пересменка</h2><label>Передать все мои столы<select value={successor} onChange={event => setSuccessor(event.target.value)}><option value="">Выберите коллегу</option>{staff.filter(item => item.id !== actor).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button disabled={!successor || !mine.length} onClick={() => { void dispatch({ type: 'transfer', orders: Object.fromEntries(mine.map(order => [order.id, actor])), owner: successor }) }}>Передать · {mine.length}</Button></section>
            {account.certificate && <Certificate actor={actor} certificate={account.certificate}/>}
            <div className="row wrap"><Button onClick={() => setHelp(true)}>Помощь Саши</Button><Button onClick={training}>Повторить обучение</Button><Button onClick={signOut}>Выйти из профиля</Button></div>
            {Developer && <Suspense><Developer data={data} branch={branch} actor={actor} dispatch={dispatch} training={training}/></Suspense>}
          </div>}
        </div></section>)}
      </div>
    </main>
    {selected && <Dialog title={current ? tableTitle(current) : selected.kind === 'table' ? `Стол ${tableNumber(selected.key)}` : currentDish?.name ?? 'Заказ'} close={() => select(undefined)}>
      {current ? <OrderEditor key={current.id} order={current} data={data} actor={actor} branch={branch} now={now} dispatch={dispatch} favorites={favorites} toggle={toggle} pending={pending.flatMap(({ command }) => 'order' in command && command.order === current.id && ['send', 'status', 'pay', 'close'].includes(command.type) ? [command] : [])}/> :
        selected.kind === 'table' ? <OpenTable key={selected.key} table={selected.key} dispatch={dispatch} pending={pending.some(row => row.command.type === 'open' && row.command.table === selected.key)} done={() => {}}/> :
        currentDish ? <div className="stack"><p>{currentDish.description}</p><p>{money(currentDish.price)} · {currentDish.prep} мин · {data.stock[currentDish.id]?.count === 0 ? 'Стоп-лист' : 'В наличии'}</p><p className="muted">{currentDish.allergens}</p><Button onClick={() => { select(undefined); go('stop-list') }}>К стоп-листу</Button></div> : <Empty>Заказ недоступен. Проверьте выбранную точку.</Empty>}
      {(uiError || rejected[0]?.rejected) && <p className="callout danger" role="alert">{uiError || rejected[0].rejected}</p>}
    </Dialog>}
    {notice && <Dialog title="Уведомления" close={() => setNotice(false)}>
      <Button disabled={!unread} onClick={() => mark(alerts.map(item => item.id))}>Отметить все прочитанными</Button>
      {alerts.length ? alerts.map(item => <button className="line-row" key={item.id} onClick={() => {
        mark([item.id]); setNotice(false)
        if (item.link) select(item.link)
        if (item.chat) { setChat(item.chat); go('chats') }
      }}><span><strong>{item.title}</strong><small>{new Date(item.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></span>
        {!read[item.id] && <Chip tone="ready">Новое</Chip>}</button>) : <Empty>Уведомлений пока нет.</Empty>}
    </Dialog>}
    {help && <Dialog title="Помощь Саши" close={() => setHelp(false)}><img src={asset('icons/sasha.svg')} width={70} height={70} alt="Саша"/><p>{greeting}</p><details><summary>Темы обучения</summary><ol>{lessonNames.map(name => <li key={name}>{name}</li>)}</ol></details><Button onClick={training}>Открыть обучение</Button></Dialog>}
  </div>
}
