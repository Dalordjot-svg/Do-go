import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChefHat, Clock3, Plus, Search, Star, Users } from 'lucide-react'
import { courses, eventNames, guestCount, id, issue, labels, linesOf, minutes, money, paid, shared, splitBill, tableState, total, type Command, type Line, type Order, type Workspace } from './domain'
import { makeGuests, makeLine } from './fixtures'
import { useDirectory } from './directory'
import { Button, Chip, Empty, ScreenTitle } from './ui'

export type Dispatch = (command: Command) => Promise<string | undefined>
export const versions = (lines: Line[]) => Object.fromEntries(lines.map(line => [line.id, line.version]))

export function OpenTable({ table, dispatch, pending, done }: { table: string; dispatch: Dispatch; pending?: boolean; done: () => void }) {
  const [guests, setGuests] = useState(2)
  return <form className="stack" onSubmit={async event => {
    event.preventDefault()
    if (await dispatch({ type: 'open', order: id(), table, guests: makeGuests(guests) })) done()
  }}>
    <label data-coach="guest-count">Количество гостей<input type="number" min="1" max="99" value={guests} onChange={event => setGuests(event.target.valueAsNumber)} required/></label>
    <div data-coach="open-submit"><Button primary type="submit" disabled={pending}><Users size={17}/>{pending ? 'Ожидает подтверждения' : 'Открыть стол'}</Button></div>
  </form>
}

export function Catalog({ stock, favorites, toggle, add, recent = [] }: {
  stock: Workspace['stock']; favorites: string[]; toggle: (key: string) => void; add: (key: string) => void; recent?: string[]
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Популярное')
  const [message, setMessage] = useState('')
  const { catalog, categories } = useDirectory()
  const filtered = catalog.filter(item => item.name.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')) &&
    (search.trim() || category === 'Все' || category === item.category || (category === 'Популярное' && item.popular) ||
    (category === 'Избранное' && favorites.includes(item.id)) || (category === 'Недавнее' && recent.includes(item.id))))
  return <div className="stack">
    <label className="search"><Search size={17}/><input aria-label="Поиск по меню" placeholder="Найти блюдо" value={search} onChange={event => setSearch(event.target.value)}/></label>
    <div className="filters segmented">{['Все', 'Популярное', 'Недавнее', 'Избранное', ...categories].map(key =>
      <button key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{key}</button>)}</div>
    {message && <div className="callout danger" role="status">{message}</div>}
    <div className="catalog-grid">{filtered.map(item => {
      const count = stock[item.id]?.count ?? -1
      return <article className="catalog-item" key={item.id} data-coach={item.id === 'd0-2' ? 'popular' : undefined}>
        <div className="catalog-info"><strong>{item.name}</strong><p className="muted">{item.category} · {item.prep} мин</p>
          {count >= 0 && <Chip tone={count ? 'other' : 'late'}>{count ? `${count} шт.` : 'Стоп-лист'}</Chip>}
          {item.allergens && <details><summary>Состав</summary><small>{item.description}. Аллергены: {item.allergens}.</small></details>}
        </div>
        <div className="row catalog-actions">
          <button className="icon star-button" aria-label={favorites.includes(item.id) ? 'Убрать из избранного' : 'В избранное'} aria-pressed={favorites.includes(item.id)} onClick={() => toggle(item.id)}><Star size={17} fill={favorites.includes(item.id) ? 'currentColor' : 'none'}/></button>
          <button className="price-add" aria-label="Добавить" aria-description={item.name} onClick={() => {
            if (!count) { setMessage(`${item.name}: блюдо недоступно. Выберите другую позицию.`); add(item.id); return }
            setMessage(''); add(item.id)
          }}><span>{money(item.price)}</span><Plus size={18}/></button>
        </div>
      </article>
    })}</div>
    {!filtered.length && <Empty>Блюда не найдены.</Empty>}
  </div>
}

export function Orders({ data, actor, now, open }: { data: Workspace; actor: string; now: number; open: (order: Order) => void }) {
  const directory = useDirectory()
  const [search, setSearch] = useState('')
  const [own, setOwn] = useState(true)
  const [filter, setFilter] = useState('Активные')
  const active = Object.values(data.active)
  const archived = Object.values(data.archived)
  const archivedFilter = ['Завершённые', 'Отменённые', 'Архив'].includes(filter)
  const rows = (archivedFilter ? archived : active).filter(order => (!own || order.owner === actor) &&
    `Стол ${directory.table(order.table)} ${directory.person(order.owner)?.name ?? ''} ${order.id}`.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(order => ({
      'Завершённые': order.state === 'closed', 'Отменённые': order.state === 'cancelled',
      'Готовятся': linesOf(order).some(line => ['accepted', 'cooking'].includes(line.status)),
      'К выдаче': linesOf(order).some(line => line.status === 'ready'), 'Задержка': linesOf(order).some(line => issue(line, now)),
      'К расчёту': order.state === 'bill'
    })[filter] ?? true).sort((a, b) => {
      const importance = (order: Order) => linesOf(order).some(line => issue(line, now)) ? 2 : Number(linesOf(order).some(line => line.status === 'ready'))
      return (archivedFilter ? 0 : importance(b) - importance(a)) || (b.ended ?? b.opened) - (a.ended ?? a.opened)
    })
  return <div className="stack">
    <ScreenTitle title="Заказы">Активные заказы и история обслуживания.</ScreenTitle>
    <div className="row wrap"><div className="segmented"><button aria-pressed={own} onClick={() => setOwn(true)}>Мои · {active.filter(order => order.owner === actor).length}</button><button aria-pressed={!own} onClick={() => setOwn(false)}>Все · {active.length}</button></div>
      <label className="search"><Search size={17}/><input aria-label="Поиск заказов" placeholder="Стол, сотрудник, заказ" value={search} onChange={event => setSearch(event.target.value)}/></label>
    </div>
    <div className="filters segmented">{['Активные', 'Готовятся', 'К выдаче', 'Задержка', 'К расчёту', 'Завершённые', 'Отменённые', 'Архив'].map(key => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{key}</button>)}</div>
    <div className="order-grid" data-coach="order-list">{rows.map(order => {
      const [tone, title] = archivedFilter ? ['free', order.state === 'closed' ? 'Завершён' : order.state === 'merged' ? 'Объединён' : 'Отменён'] : tableState(order, actor, now)
      const lines = linesOf(order)
      const served = lines.filter(line => line.status === 'served').length
      return <button className={`panel card card-action order-card ${tone}`} key={order.id} onClick={() => open(order)}>
        <div className="row spread"><strong>Стол {directory.table(order.table)}</strong><Chip tone={tone}>{title}</Chip></div>
        <span className="muted">{(directory.person(order.owner)?.name ?? 'Коллега')} · {guestCount(order)} гост. · {minutes(order.opened, order.ended ?? now)} мин</span>
        <div className="row spread"><span className="muted">Выдано {served} из {lines.length}</span><strong>{money(total(order))}</strong></div>
      </button>
    })}</div>
    {!rows.length && <Empty>Заказов по этим условиям нет.</Empty>}
  </div>
}

function LineEdit({ line, order, dispatch, close }: { line: Line; order: Order; dispatch: Dispatch; close: () => void }) {
  const directory = useDirectory()
  const [baseVersion] = useState(line.version)
  const [quantity, setQuantity] = useState(line.quantity)
  const [guest, setGuest] = useState(line.guest)
  const [selection, setSelection] = useState(line.modifiers.split(', ').filter(Boolean))
  const [note, setNote] = useState(line.note)
  const [course, setCourse] = useState(line.course)
  return <form className="stack panel pad" aria-label="Редактирование позиции" onSubmit={async event => {
    event.preventDefault()
    if (await dispatch({ type: 'edit', order: order.id, line: line.id, version: baseVersion, patch: { ...(line.status === 'draft' ? { quantity } : {}), guest, modifiers: selection.join(', '), note, course } })) close()
  }}>
    <h3>{line.name}</h3>
    <div className="form-grid">
      {line.status === 'draft' && <label>Количество<input type="number" value={quantity} min="1" max="99" required onChange={event => setQuantity(event.target.valueAsNumber)}/></label>}
      <label>Гость<select value={guest} onChange={event => setGuest(event.target.value)}><option value={shared}>На общий стол</option>{Object.values(order.guests).map(seat => <option key={seat.id} value={seat.id}>{seat.name}</option>)}</select></label>
      <label>Подача<select value={course} onChange={event => setCourse(event.target.value as Line['course'])}>{courses.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <fieldset><legend>Модификаторы</legend><div className="row wrap">{directory.catalog.find(item => item.id === line.item)?.modifiers.map(value => <label className="row" key={value}><input type="checkbox" checked={selection.includes(value)} onChange={event => setSelection(list => event.target.checked ? [...list, value] : list.filter(option => option !== value))}/>{value}</label>)}</div></fieldset>
    <label>Комментарий к блюду<input value={note} maxLength={300} onChange={event => setNote(event.target.value)} placeholder="Пожелания гостя"/></label>
    <div className="row"><Button primary type="submit">Сохранить позицию</Button><Button onClick={close}>Назад</Button></div>
  </form>
}

function Billing({ order, dispatch }: { order: Order; dispatch: Dispatch }) {
  const [mode, setMode] = useState('Общий')
  const [selected, setSelected] = useState<string[]>([])
  const payable = linesOf(order).filter(line => line.status === 'served' && order.paidLines?.[line.id] === undefined)
  const current = mode === 'По позициям' ? payable.filter(line => selected.includes(line.id)) : payable
  const amount = current.reduce((sum, line) => sum + line.quantity * line.price, 0)
  const shares = splitBill({ ...order, lines: Object.fromEntries(current.map(line => [line.id, line])) })
  return <div className="stack panel pad">
    <h3>Тестовый расчёт</h3>
    <div className="segmented">{['Общий', 'По гостям', 'По позициям'].map(value => <button key={value} aria-pressed={value === mode} onClick={() => setMode(value)}>{value}</button>)}</div>
    {mode === 'По гостям' && Object.entries(shares).map(([key, value]) => <div className="row spread" key={key}><span>{order.guests[key]?.name ?? 'Общий стол'}</span><strong>{money(value)}</strong></div>)}
    {mode === 'По позициям' && payable.map(line => <label className="row" key={line.id}><input type="checkbox" checked={selected.includes(line.id)} onChange={event => setSelected(list => event.target.checked ? [...list, line.id] : list.filter(key => key !== line.id))}/>{line.name} · {money(line.quantity * line.price)}</label>)}
    <div className="row spread"><span>Учтено {money(paid(order))} из {money(total(order))}</span><strong>{money(amount)}</strong></div>
    <div className="row wrap"><Button primary disabled={!current.length} onClick={() => { void dispatch({ type: 'pay', order: order.id, lines: versions(current), payments: mode === 'По гостям' ? shares : { [shared]: amount } }) }}>Учесть тестовую оплату</Button>
      <Button disabled={linesOf(order).some(line => line.status !== 'served' || order.paidLines?.[line.id] === undefined)} onClick={() => { void dispatch({ type: 'close', order: order.id }) }}>Завершить заказ</Button></div>
  </div>
}

export function OrderEditor({ order, data, actor, now, dispatch, favorites, toggle, pending = [], observeDish }: {
  order: Order; data: Workspace; actor: string; now: number; dispatch: Dispatch; favorites: string[]; toggle: (key: string) => void; pending?: Command[]
  observeDish?: (key: string) => void
}) {
  const directory = useDirectory()
  const [guest, setGuest] = useState(shared)
  const [tab, setView] = useState('Позиции')
  const [editing, setEditing] = useState('')
  const [voiding, setVoiding] = useState('')
  const [voidVersion, setVoidVersion] = useState(0)
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(false)
  const [owner, setOwner] = useState('')
  const [destination, setDestination] = useState('')
  const [merge, setMerge] = useState('')
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [note, setNote] = useState<string | undefined>()
  const [previousNote, setPreviousNote] = useState<string | undefined>()
  const lines = linesOf(order)
  const ready = lines.filter(line => line.status === 'ready')
  const draft = lines.filter(line => line.status === 'draft')
  const served = lines.filter(line => line.status === 'served')
  const archived = !data.active[order.id]
  const view = archived && tab !== 'История' ? 'Позиции' : tab
  const selectedGuest = order.guests[guest] ? guest : shared
  const recent = [...Object.values(data.active), ...Object.values(data.archived)].flatMap(linesOf).filter(line => line.actor === actor).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(line => line.item)
  const status = (line: Line, next: 'cooking' | 'ready' | 'served') => { void dispatch({ type: 'status', order: order.id, lines: versions([line]), status: next }) }
  async function add(key: string, forGuest = selectedGuest) {
    observeDish?.(key)
    const item = directory.catalog.find(item => item.id === key)
    if (item && (data.stock[key]?.count ?? -1) !== 0) await dispatch({ type: 'add', order: order.id, line: makeLine(item, actor, forGuest) })
  }
  return <div className="stack order-editor">
    <div className="row spread wrap order-meta"><span className="muted">№ {order.id.slice(0, 8)} · {(directory.person(order.owner)?.name ?? 'Коллега')} · {guestCount(order)} гост. · {minutes(order.opened, order.ended ?? now)} мин</span><strong>{money(total(order))}</strong></div>
    <div className="segmented order-tabs">{(archived ? ['Позиции', 'История'] : ['Позиции', 'Меню', 'Гости', 'Управление', 'История', 'Расчёт']).map(key => <button key={key} onClick={() => setView(key)} aria-pressed={view === key}>{key}</button>)}</div>
    <div className="order-catalog stack" hidden={view !== 'Меню' || archived}>
      <div className="guest-switch" aria-label="Гости заказа"><button aria-pressed={selectedGuest === shared} onClick={() => setGuest(shared)}>На общий стол</button>{Object.values(order.guests).map(seat => <button key={seat.id} aria-pressed={selectedGuest === seat.id} onClick={() => setGuest(seat.id)}>{seat.name}</button>)}</div>
      <label className="sr-only">Добавить для<select value={selectedGuest} onChange={event => setGuest(event.target.value)}><option value={shared}>На общий стол</option>{Object.values(order.guests).map(seat => <option value={seat.id} key={seat.id}>{seat.name}</option>)}</select></label>
      <Catalog stock={data.stock} favorites={favorites} toggle={toggle} add={key => { void add(key) }} recent={recent}/>
      <Button onClick={() => setView('Позиции')}><ArrowLeft size={16}/> К заказу</Button>
    </div>
    {view === 'Позиции' && <>
      <div className="row spread wrap" data-coach="add-menu"><span>Выдано {served.length} из {lines.length} позиций</span>{!archived && <Button primary onClick={() => setView('Меню')}><Plus size={17}/> Добавить блюда</Button>}</div>
      {!archived && (!lines.length || draft.length > 0) && <div className="quick-menu">
        <small>Быстро на общий стол</small><div className="row wrap">{directory.catalog.filter(item => item.popular && (data.stock[item.id]?.count ?? -1) !== 0).slice(0, 5).map(item => <button className="price-add" key={item.id} onClick={() => { void add(item.id, shared) }}><Plus size={16}/>{item.name}</button>)}</div>
      </div>}
      {lines.length > 0 && <progress aria-label="Прогресс выдачи" value={served.length} max={lines.length}/>}
      {pending.length > 0 && <p className="callout" role="status">Ожидает подтверждения · {pending.length} опер.</p>}
      {!lines.length && <Empty>Добавьте первое блюдо из меню.</Empty>}
      {[{ id: shared, name: 'На общий стол' }, ...Object.values(order.guests)].map(seat => {
        const seatLines = Object.values(order.lines).filter(line => line.guest === seat.id)
        if (!seatLines.length) return null
        return <section key={seat.id} className="order-seat stack">
          <h3>{seat.name}</h3>
          {seatLines.map(line => <div key={line.id} className="stack separator">
            <div className="row spread"><strong>{line.quantity} × {line.name}</strong><Chip tone={issue(line, now) ? 'late' : line.status === 'ready' ? 'ready' : 'free'}>{issue(line, now) || labels[line.status]}</Chip></div>
            <p className="muted">{[money(line.quantity * line.price), line.course, line.modifiers, line.note, line.cancellation].filter(Boolean).join(' · ')}</p>
            {!archived && line.status !== 'cancelled' && <div className="row wrap" data-coach="line-actions">
              {!['served'].includes(line.status) && !order.paidLines?.[line.id] && <Button onClick={() => { setEditing(line.id); setVoiding('') }}>Изменить</Button>}
              <Button onClick={() => { void dispatch({ type: 'add', order: order.id, line: { ...makeLine(directory.catalog.find(item => item.id === line.item)!, actor, line.guest), quantity: line.quantity, modifiers: line.modifiers, note: line.note, course: line.course } }) }}>Дублировать</Button>
              {line.status === 'draft' && <Button onClick={() => { void dispatch({ type: 'remove', order: order.id, line: line.id, version: line.version }) }}>Удалить черновик</Button>}
              {line.status === 'accepted' && <Button onClick={() => status(line, 'cooking')}><ChefHat size={16}/> Начать готовить</Button>}
              {['accepted', 'cooking'].includes(line.status) && <Button onClick={() => status(line, 'ready')}>Отметить готовым</Button>}
              {line.status === 'ready' && <Button primary onClick={() => status(line, 'served')}><Check size={16}/> Выдано гостю</Button>}
              {line.status === 'served' && !order.paidLines?.[line.id] && <Button onClick={() => status(line, 'ready')}>Исправить выдачу</Button>}
              {['accepted', 'cooking', 'ready'].includes(line.status) && <Button onClick={() => { setVoiding(line.id); setVoidVersion(line.version); setEditing(''); setReason(''); setRestock(false) }}>Отменить позицию</Button>}
            </div>}
            {editing === line.id && <LineEdit line={line} order={order} dispatch={dispatch} close={() => setEditing('')}/>}
            {voiding === line.id && <form className="stack" onSubmit={async event => {
              event.preventDefault()
              if (await dispatch({ type: 'void', order: order.id, line: line.id, version: voidVersion, reason, restock })) setVoiding('')
            }}>
              <label>Причина отмены<input value={reason} onChange={event => setReason(event.target.value)} required maxLength={200}/></label>
              {line.status === 'accepted' && line.reserved && <label className="row"><input type="checkbox" checked={restock} onChange={event => setRestock(event.target.checked)}/> Вернуть доступную порцию</label>}
              <div className="row"><Button type="submit" primary>Подтвердить отмену</Button><Button onClick={() => setVoiding('')}>Назад</Button></div>
            </form>}
          </div>)}
        </section>
      })}
      {!archived && <div className="row wrap" data-coach="fulfillment">
        {ready.length > 0 && <Button primary onClick={() => { void dispatch({ type: 'status', order: order.id, lines: versions(ready), status: 'served' }) }}>Выдать все готовые · {ready.length}</Button>}
      </div>}
    </>}
    {view === 'Гости' && !archived && <>
      {Object.values(order.guests).map(seat => <form className="row wrap" key={seat.id} onSubmit={event => {
        event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name')).trim()
        if (name) void dispatch({ type: 'guest', order: order.id, seat: { ...seat, name } })
      }}><label>Имя персоны<input name="name" defaultValue={seat.name} required maxLength={50}/></label><Button type="submit">Сохранить</Button>
        <Button disabled={guestCount(order) === 1 || lines.some(line => line.guest === seat.id)} onClick={() => { void dispatch({ type: 'guest', order: order.id, seat, remove: true }) }}>Удалить гостя</Button></form>)}
      <Button onClick={() => { void dispatch({ type: 'guest', order: order.id, seat: { id: id(), name: `Гость ${guestCount(order) + 1}` } }) }}><Plus size={16}/> Добавить гостя</Button>
    </>}
    {view === 'Управление' && !archived && <div className="stack">
      <form className="stack" onSubmit={async event => { event.preventDefault(); if (note !== undefined && await dispatch({ type: 'note', order: order.id, note, previous: previousNote ?? order.note })) { setNote(undefined); setPreviousNote(undefined) } }}>
        <label>Комментарий к заказу<textarea value={note ?? order.note} maxLength={500} onChange={event => { if (previousNote === undefined) setPreviousNote(order.note); setNote(event.target.value) }}/></label>
        <Button type="submit" disabled={note === undefined}>Сохранить комментарий</Button>
      </form>
      <label>Передать стол<select value={owner} onChange={event => setOwner(event.target.value)}><option value="">Выбрать коллегу</option>{directory.staff.filter(person => person.id !== order.owner && !person.disabled).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <Button disabled={!owner || owner === order.owner} onClick={() => { void dispatch({ type: 'transfer', orders: { [order.id]: order.owner }, owner }) }}>Передать стол</Button>
      <label>Перенести заказ<select value={destination} onChange={event => setDestination(event.target.value)}><option value="">Свободный стол</option>{directory.layout.filter(table => !data.occupied[table.id]).map(table => <option key={table.id} value={table.id}>Стол {table.number}</option>)}</select></label>
      <Button disabled={!destination || Boolean(data.occupied[destination])} onClick={() => { void dispatch({ type: 'move', order: order.id, from: order.table, table: destination }) }}>Перенести заказ</Button>
      <label>Объединить заказ<select value={merge} onChange={event => { setMerge(event.target.value); setConfirmMerge(false) }}><option value="">Активный стол</option>{Object.values(data.active).filter(other => other.id !== order.id).map(other => <option key={other.id} value={other.id}>Стол {directory.table(other.table)}</option>)}</select></label>
      <Button disabled={!merge} onClick={() => { if (confirmMerge) void dispatch({ type: 'merge', order: order.id, into: merge }); else setConfirmMerge(true) }}>{confirmMerge ? 'Подтвердить объединение' : 'Объединить'}</Button>
      <Button disabled={lines.some(line => line.status !== 'draft')} onClick={() => {
        if (confirmCancel) void dispatch({ type: 'close', order: order.id, cancel: true })
        else setConfirmCancel(true)
      }}>{confirmCancel ? 'Подтвердить отмену заказа' : 'Отменить заказ'}</Button>
    </div>}
    {view === 'История' && <div className="stack">{Object.values(data.audit).filter(event => event.order === order.id ||
      (event.kind === 'transfer' && Object.hasOwn(JSON.parse(event.before), order.id)) ||
      (event.kind === 'merge' && (JSON.parse(event.after) as { order?: string })?.order === order.id) ||
      (event.item && Object.values(order.lines).some(line => line.item === event.item) && event.kind === 'stock')
    ).sort((a, b) => b.at - a.at).map(event => <details className="panel pad" key={event.id}>
      <summary>{eventNames[event.kind]} · {(directory.person(event.actor)?.name ?? 'Коллега')} · {new Date(event.at).toLocaleString('ru-RU')}</summary>
      <p className="muted history-values">{event.before} <ArrowRight size={14}/> {event.after}</p>
    </details>)}</div>}
    {!archived && <footer className="order-checkout" data-coach="send">
      <div><small>{lines.length} поз. в заказе</small><strong>{money(total(order))}</strong></div>
      <Button primary disabled={!draft.length || pending.some(command => command.type === 'send')} onClick={() => { void dispatch({ type: 'send', order: order.id, lines: versions(draft) }); setView('Позиции') }}>
        {draft.length ? `Подтвердить · ${draft.length}` : 'Отправить заказ'}
      </Button>
    </footer>}
    {view === 'Расчёт' && !archived && <>
      {order.state !== 'bill' && <Button onClick={() => { void dispatch({ type: 'bill', order: order.id }) }}><Clock3 size={17}/> Отметить ожидание расчёта</Button>}
      <Billing order={order} dispatch={dispatch}/>
    </>}
  </div>
}
