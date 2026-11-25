import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BarChart3, BookOpenCheck, ChevronRight, ClipboardList, Coffee, Grid2X2, MapPin, Settings2, Shield, Users } from 'lucide-react'
import { eventNames, guestCount, id, issue, linesOf, minutes, money, paid, type Branch, type ConfigChange, type Dish, type Order, type Staff, type Table, type Workspace } from './domain'
import { useDirectory } from './directory'
import { lessonNames } from './academy'
import { Plan } from './hall'
import { Inventory } from './inventory'
import type { Dispatch } from './orders'
import { Avatar, Button, Chip, Empty } from './ui'

const sections = [
  ['overview', 'Обзор', BarChart3], ['staff', 'Сотрудники', Users], ['branches', 'Точки', MapPin],
  ['layout', 'Редактор зала', Grid2X2], ['tables', 'Столы', Grid2X2], ['menu', 'Редактор меню', Coffee],
  ['categories', 'Категории и модификаторы', Settings2], ['inventory', 'Остатки и стоп-лист', ClipboardList],
  ['active', 'Активные заказы', ClipboardList], ['archive', 'Архив заказов', ClipboardList], ['history', 'История действий', ClipboardList],
  ['analytics', 'Аналитика', BarChart3], ['timings', 'Нормативы', Settings2], ['academy', 'Обучение', BookOpenCheck],
  ['certificates', 'Сертификаты', BookOpenCheck], ['settings', 'Настройки', Settings2]
] as const
type Section = typeof sections[number][0]
type Save = (change: ConfigChange, version: number) => Promise<string | undefined>
const emptyDish = (): Dish => ({ id: id(), name: '', category: 'Кофе', price: 0, description: '', allergens: '', prep: 4, wait: 3, modifiers: [], popular: false })
const toList = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean)
const form = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); return new FormData(event.currentTarget) }
const field = (data: FormData, key: string) => String(data.get(key) ?? '').trim()

function AdminMenu({ data, save, timing, modifiers }: { data: Workspace; save: Save; timing?: boolean; modifiers?: boolean }) {
  const { catalog, categories, categoryId } = useDirectory()
  const [selected, setSelected] = useState<Dish>()
  const [search, setSearch] = useState('')
  const [version, setVersion] = useState(0)
  function edit(dish: Dish) {
    setVersion(data.config?.dish?.[dish.id]?.configVersion ?? 0)
    setSelected({ ...dish })
  }
  return <div className="admin-editor">
    <section className="admin-list stack">
      <div className="row spread"><h2>{modifiers ? 'Модификаторы блюд' : 'Блюда'}</h2>{!timing && !modifiers && <Button primary onClick={() => edit(emptyDish())}>Добавить блюдо</Button>}</div>
      <input aria-label="Поиск в меню" value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по меню"/>
      {catalog.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase())).map(item => <button key={item.id} className="line-row" aria-pressed={selected?.id === item.id} onClick={() => edit(item)}>
        <span><strong>{item.name}</strong><small>{item.category} · {timing ? `${item.prep} мин + ${item.wait} мин` : modifiers ? `${item.modifiers.length} модиф.` : money(item.price)}</small></span><ChevronRight size={17}/>
      </button>)}
    </section>
    {selected ? <section className="admin-inspector"><form className="stack" key={selected.id} onSubmit={async event => {
      const values = form(event)
      const entry = { ...selected,
        ...(!timing && !modifiers ? { name: field(values, 'name'), category: categoryId(field(values, 'category')), price: Math.round(Number(field(values, 'price')) * 100),
          description: field(values, 'description'), allergens: field(values, 'allergens'), popular: values.has('popular') } : {}),
        ...(!timing ? { modifiers: toList(field(values, 'modifiers')) } : {}),
        ...(!modifiers ? { prep: Number(field(values, 'prep')), wait: Number(field(values, 'wait')) } : {})
      }
      if (await save({ kind: 'dish', entry }, version)) setSelected(undefined)
    }}>
      <div className="row spread wrap"><h2>{selected.name || 'Новое блюдо'}</h2><Button primary type="submit">Сохранить блюдо</Button></div>
      {!timing && !modifiers && <>
        <label>Название<input name="name" defaultValue={selected.name} required maxLength={80}/></label>
        <div className="form-grid"><label>Категория<select name="category" defaultValue={selected.category}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Цена, ₽<input name="price" type="number" min="0" step=".01" defaultValue={selected.price / 100} required/></label></div>
        <label>Описание<input name="description" defaultValue={selected.description}/></label>
        <label>Аллергены<input name="allergens" defaultValue={selected.allergens}/></label>
        <label className="row"><input name="popular" type="checkbox" defaultChecked={selected.popular}/> Популярная позиция</label>
      </>}
      {!timing && <label>Модификаторы через запятую<textarea name="modifiers" defaultValue={selected.modifiers.join(', ')}/></label>}
      {!modifiers && <div className="form-grid"><label>Приготовление, мин<input name="prep" type="number" min="1" max="240" defaultValue={selected.prep} required/></label>
        <label>Ожидание выдачи, мин<input name="wait" type="number" min="1" max="120" defaultValue={selected.wait} required/></label></div>}
    </form></section> : <Empty>Выберите блюдо для редактирования.</Empty>}
  </div>
}

function LayoutEditor({ data, branch, actor, now, save, map }: { data: Workspace; branch: string; actor: string; now: number; save: Save; map: boolean }) {
  const { layout } = useDirectory()
  const [draft, setDraft] = useState<Table>()
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [key, setKey] = useState('')
  const editing = layout.some(table => table.id === draft?.id)
  function choose(table: Table) {
    if (key !== table.id) setVersion(data.config?.table?.[table.id]?.configVersion ?? 0)
    setKey(table.id)
    setDraft(table)
    setError('')
  }
  const tables = draft && !layout.some(table => table.id === draft.id) ? [...layout, draft] : layout.map(table => table.id === draft?.id ? draft : table)
  const fields = [['number', 'Номер', 1, 999], ['seats', 'Мест', 1, 99], ['x', 'X, %', 0, 100], ['y', 'Y, %', 0, 100], ['w', 'Ширина, %', 6, 45], ['h', 'Высота, %', 6, 36]] as const
  return <div className="admin-editor layout-editor">
    <section className="stack">
      <div className="row spread"><span className="muted">{map ? 'Перетащите стол или задайте координаты.' : `${layout.length} столов`}</span><Button primary onClick={() => choose({ id: id(), number: Math.max(0, ...layout.map(table => table.number)) + 1, x: 50, y: 50, w: 15, h: 15, seats: 2, zone: 'Основной зал', round: false })}>Добавить стол</Button></div>
      {map ? <Plan key={branch} tables={tables} data={data} actor={actor} now={now} selected={draft?.id} open={id => { const table = tables.find(table => table.id === id); if (table) choose(table) }} move={choose}/> :
        <div>{tables.map(table => <button className="line-row" key={table.id} onClick={() => choose(table)}><span><strong>Стол {table.number}</strong><small>{table.seats} мест · {table.zone}</small></span><ChevronRight size={16}/></button>)}</div>}
    </section>
    <section className="admin-inspector">{draft ? <form className="stack" onSubmit={async event => {
      event.preventDefault()
      if (layout.some(table => table.id !== draft.id && table.number === draft.number)) { setError('Этот номер уже используется.'); return }
      if (await save({ kind: 'table', entry: draft }, version)) { setDraft(undefined); setKey('') }
    }}>
      <div className="row spread wrap"><h2>{editing ? `Стол ${draft.number}` : 'Новый стол'}</h2><Button primary type="submit">Сохранить стол</Button></div>
      <div className="form-grid">{fields.map(([name, label, min, max]) => <label key={name}>{label}<input type="number" required min={min} max={max} step={name === 'number' || name === 'seats' ? 1 : .1} value={Number.isFinite(draft[name]) ? draft[name] : ''} onChange={event => setDraft({ ...draft, [name]: event.target.valueAsNumber })}/></label>)}</div>
      <label>Зона<input value={draft.zone} onChange={event => setDraft({ ...draft, zone: event.target.value })} required/></label>
      <label>Форма<select value={draft.round ? 'round' : 'rectangle'} onChange={event => setDraft({ ...draft, round: event.target.value === 'round' })}><option value="rectangle">Прямоугольная</option><option value="round">Круглая</option></select></label>
      {error && <p role="alert" className="callout danger">{error}</p>}
    </form> : <Empty>Выберите стол на плане.</Empty>}</section>
  </div>
}

function People({ kind, registry, actor, save }: { kind: 'staff' | 'branch'; registry?: Workspace; actor: string; save: Save }) {
  const directory = useDirectory()
  const items = kind === 'staff' ? directory.staff : directory.branches
  const [selected, select] = useState<Staff | Branch>()
  const [version, setVersion] = useState(0)
  function edit(item: Staff | Branch) { select(item); setVersion(registry?.config?.[kind]?.[item.id]?.configVersion ?? 0) }
  return <div className="admin-editor">
    <div className="stack"><Button primary onClick={() => edit(kind === 'staff' ? { id: id(), name: '', initials: '', role: 'Официант', color: 'blue' } : { id: id(), name: '' })}>{kind === 'staff' ? 'Создать профиль' : 'Создать точку'}</Button>
      {items.map(item => <button className="line-row" key={item.id} onClick={() => edit(item)}><span><strong>{item.name}</strong><small>{item.disabled ? 'Отключён' : 'role' in item && typeof item.role === 'string' ? item.role : 'Открыта'}</small></span><ChevronRight size={16}/></button>)}
    </div>
    {selected && <section className="admin-inspector"><form className="stack" key={selected.id} onSubmit={async event => {
      const values = form(event)
      const name = field(values, 'name')
      const base = { id: selected.id, name, disabled: selected.id !== actor && values.has('disabled') }
      const change: ConfigChange = 'role' in selected ? { kind: 'staff', entry: { ...base, initials: name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(), color: selected.color, role: field(values, 'role'), admin: selected.id === actor || values.has('admin') } } : { kind: 'branch', entry: base }
      if (await save(change, version)) select(undefined)
    }}>
      <h2>{selected.name || 'Новая запись'}</h2>
      <label>{'role' in selected ? 'Имя сотрудника' : 'Название точки'}<input name="name" defaultValue={selected.name} maxLength={80} required/></label>
      {'role' in selected && <><label>Должность<input name="role" defaultValue={selected.role} required/></label>
        <label className="row"><input name="admin" type="checkbox" defaultChecked={selected.admin || selected.role === 'Администратор'} disabled={selected.id === actor}/> Доступ к демонстрационной панели</label></>}
      <label className="row"><input name="disabled" type="checkbox" defaultChecked={selected.disabled} disabled={selected.id === actor}/> Отключить</label>
      <Button primary type="submit">Сохранить</Button>
    </form></section>}
  </div>
}

function Categories({ data, save }: { data: Workspace; save: Save }) {
  const { categories } = useDirectory()
  const [selected, select] = useState('')
  return <div className="stack">
    <form className="row wrap" key={selected} onSubmit={event => {
      const values = form(event)
      const name = field(values, 'name')
      const previous = Object.values(data.config?.category ?? {}).find(item => item.name === selected)
      void save({ kind: 'category', entry: { id: previous?.id ?? (selected || id()), name } }, previous?.configVersion ?? 0).then(value => { if (value) select('') })
    }}>
      <label>Категория<select value={selected} onChange={event => select(event.target.value)}><option value="">Новая категория</option>{categories.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Название<input name="name" defaultValue={selected} required/></label>
      <Button type="submit" primary>Сохранить категорию</Button>
    </form>
    <AdminMenu data={data} save={save} modifiers/>
  </div>
}

export default function Admin({ data, registry, actor, branch, now, order, dispatch, save, close }: {
  data: Workspace; registry?: Workspace; actor: string; branch: string; now: number; order: (order: Order) => void
  dispatch: Dispatch; save: Save; close: () => void
}) {
  const [section, select] = useState<Section>('overview')
  const directory = useDirectory()
  const active = Object.values(data.active)
  const archived = Object.values(data.archived)
  const closed = archived.filter(item => item.state === 'closed')
  const revenue = closed.reduce((sum, item) => sum + paid(item), 0)
  const report = [
    ['Активные столы', active.length], ['Свободные столы', directory.layout.length - active.length],
    ['Обслужено гостей', closed.reduce((sum, item) => sum + guestCount(item), 0)], ['Заказы с задержкой', active.filter(item => linesOf(item).some(line => issue(line, now))).length],
    ['Тестовые продажи', money(revenue)], ['Средний чек', money(closed.length ? Math.round(revenue / closed.length) : 0)],
    ['Среднее обслуживание', closed.length ? `${Math.round(closed.reduce((sum, item) => sum + minutes(item.opened, item.ended ?? now), 0) / closed.length)} мин` : '—']
  ]
  let content: ReactNode
  switch (section) {
    case 'overview':
    case 'analytics':
      content = <><div className="metrics">{report.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
        {section === 'overview' && <div className="stack"><h2>Управление сменой</h2>{sections.filter(([key]) => ['layout', 'menu', 'active', 'analytics'].includes(key)).map(([key, title, Icon]) => <button key={key} className="line-row" onClick={() => select(key)}><span className="row"><Icon size={18}/>{title}</span><ArrowRight size={16}/></button>)}</div>}</>
      break
    case 'staff':
    case 'branches':
      content = <People key={section} kind={section === 'staff' ? 'staff' : 'branch'} registry={registry} actor={actor} save={save}/>
      break
    case 'layout':
    case 'tables':
      content = <LayoutEditor key={section} data={data} branch={branch} actor={actor} now={now} map={section === 'layout'} save={save}/>
      break
    case 'menu':
    case 'timings':
      content = <AdminMenu key={section} data={data} save={save} timing={section === 'timings'}/>
      break
    case 'categories':
      content = <Categories data={data} save={save}/>
      break
    case 'inventory':
      content = <Inventory data={data} dispatch={dispatch}/>
      break
    case 'active':
    case 'archive': {
      const rows = section === 'active' ? active : archived
      content = rows.length ? rows.map(item => <button className="line-row" key={item.id} onClick={() => order(item)}><span><strong>Стол {directory.table(item.table)}</strong><small>{directory.person(item.owner)?.name ?? 'Сотрудник'} · {guestCount(item)} гост.</small></span><ArrowRight size={16}/></button>) : <Empty>Заказов пока нет.</Empty>
      break
    }
    case 'history': {
      const history = [...Object.values(data.audit), ...Object.values(registry?.audit ?? {})].sort((a, b) => b.at - a.at)
      content = history.length ? history.slice(0, 150).map(event => <details className="audit-entry" key={event.id}><summary>{eventNames[event.kind]} · {directory.person(event.actor)?.name ?? 'Сотрудник'}</summary><small>{new Date(event.at).toLocaleString('ru-RU')} · {event.operation}</small><pre>{event.after}</pre></details>) : <Empty>Действий пока нет.</Empty>
      break
    }
    case 'academy':
      content = <form className="stack admin-form" key={directory.training?.revision} onSubmit={event => {
        const values = form(event)
        const instructions = Object.fromEntries(lessonNames.map((_, index) => [String(index), field(values, `step-${index}`)]).filter(([, text]) => text))
        void save({ kind: 'training', entry: { id: 'policy', title: field(values, 'title'), note: field(values, 'note'), revision: field(values, 'revision'), instructions } }, registry?.config?.training?.policy?.configVersion ?? 0)
      }}>
        <label>Название программы<input name="title" defaultValue={directory.training?.title ?? 'COFFEEMAN Academy'} required/></label>
        <label>Версия программы<input name="revision" defaultValue={directory.training?.revision ?? '2.0'} required/></label>
        <label>Приветствие для сотрудников<textarea name="note" maxLength={250} defaultValue={directory.training?.note ?? ''}/></label>
        <details><summary>Дополнения к сценариям</summary><div className="stack">
          {lessonNames.map((name, index) => <label key={name}>{name}<input name={`step-${index}`} maxLength={100} defaultValue={directory.training?.instructions?.[index] ?? ''}/></label>)}
        </div></details>
        <Button type="submit" primary>Сохранить программу</Button>
      </form>
      break
    case 'certificates':
      content = directory.certificates.length ? directory.certificates.map(item => <div className="line-row" key={item.token}>
        <span className="row"><Avatar actor={item.actor} small/><span><strong>{directory.person(item.actor)?.name ?? 'Сотрудник'}</strong><small>{item.token} · {new Date(item.at).toLocaleDateString('ru-RU')}</small></span></span><Chip tone="mine">{item.score}%</Chip>
      </div>) : <Empty>Демонстрационные сертификаты появятся после аттестации сотрудников.</Empty>
      break
    case 'settings':
      content = <form className="stack admin-form" onSubmit={event => {
        const values = form(event)
        void save({ kind: 'preferences', entry: { id: 'app', name: field(values, 'name'), compactOrders: values.has('compact') } }, registry?.config?.preferences?.app?.configVersion ?? 0)
      }}>
        <label>Название рабочего пространства<input name="name" defaultValue={directory.preferences?.name ?? 'COFFEEMAN Waiter'} required/></label>
        <label className="row"><input name="compact" type="checkbox" defaultChecked={directory.preferences?.compactOrders}/> Компактный список заказов</label>
        <Button type="submit" primary>Сохранить настройки</Button>
      </form>
      break
  }
  return <div className="admin">
    <div className="row spread wrap admin-header"><div><div className="row hall-location"><Shield size={15}/> Демонстрационный доступ</div><h1>Управление</h1></div><Button onClick={close}><ArrowLeft size={17}/> К смене</Button></div>
    <div className="admin-shell">
      <nav aria-label="Разделы управления" className="admin-nav">{sections.map(([key, title, Icon]) => <button key={key} aria-current={section === key ? 'page' : undefined} onClick={() => select(key)}><Icon size={17}/>{title}</button>)}</nav>
      <section className="admin-content stack"><h2>{sections.find(([key]) => key === section)?.[1]}</h2>{content}</section>
    </div>
  </div>
}
