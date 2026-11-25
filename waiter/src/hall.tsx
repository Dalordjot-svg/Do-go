import { useRef, useState, type PointerEvent } from 'react'
import { ArrowDownLeft, ArrowRight, Bell, CircleAlert, Clock3, Coffee, Grid2X2, List, Maximize, Minus, Plus, Users } from 'lucide-react'
import { guestCount, issue, linesOf, minutes, tableState, type Table, type Workspace } from './domain'
import { useDirectory } from './directory'
import { Chip, Empty } from './ui'

const statusIcon = { free: Users, mine: Users, other: Users, ready: Bell, late: CircleAlert }
const seatForms = new Intl.PluralRules('ru')
const seatLabel = (n: number) => `${n} ${({ one: 'место', few: 'места' } as Record<string, string>)[seatForms.select(n)] ?? 'мест'}`
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function Plan({ tables, data, actor, now, open, selected, move }: {
  tables: Table[]; data: Workspace; actor: string; now: number; open: (id: string) => void
  selected?: string; move?: (table: Table) => void
}) {
  const [zoom, setZoom] = useState(1)
  const scroll = useRef<HTMLDivElement>(null)
  const floor = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | undefined>(undefined)
  const tableDrag = useRef<{ key: string; moved: boolean; x: number; y: number } | undefined>(undefined)
  const directory = useDirectory()
  function pan(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !scroll.current) return
    scroll.current.scrollLeft = drag.current.left + drag.current.x - event.clientX
    scroll.current.scrollTop = drag.current.top + drag.current.y - event.clientY
  }
  return <div className={`floor-wrap ${move ? 'editing-floor' : ''}`}>
    <div className="floor-scroller" ref={scroll} onPointerDown={event => {
      if (event.pointerType === 'touch' || zoom === 1 || (event.target as HTMLElement).closest('button')) return
      drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
      event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={pan} onPointerUp={() => { drag.current = undefined }} onPointerCancel={() => { drag.current = undefined }}>
      <div ref={floor} className="floor" style={{ width: `${100 * zoom}%`, '--map-scale': zoom } as React.CSSProperties}>
        <div className="floor-zone top"><i/> У ОКНА</div>
        <div className="floor-zone lower"><i/> ОСНОВНОЙ ЗАЛ</div>
        <div className="window-line"/><div className="divider-line"/>
        <div className="desk"><Coffee size={15}/><span>Бар · касса</span></div>
        <div className="entry"><ArrowDownLeft size={16}/> Вход</div>
        {tables.map(table => {
          const order = data.active[data.occupied[table.id]]
          const [tone, title] = tableState(order, actor, now)
          const Icon = statusIcon[tone]
          const owner = order && (directory.person(order.owner)?.name.split(' ')[0] ?? 'Коллега')
          return <button key={table.id} className={`map-table ${tone} ${table.round ? 'round' : ''} ${selected === table.id ? 'selected-table' : ''}`}
            data-coach={table.id === 't1' ? 'table' : undefined}
            style={{ left: `clamp(30px, ${table.x}%, calc(100% - 30px))`, top: `clamp(28px, ${table.y}%, calc(100% - 28px))`, width: `${table.w}%`, height: `${table.h}%` }}
            aria-label={`Стол ${table.number}, ${title}${order ? ', ' + guestCount(order) + ' гостей, ' + owner : ''}`}
            title={order ? `${title} · ${owner} · ${minutes(order.opened, now)} мин` : title}
            onClick={() => { if (!tableDrag.current?.moved) open(table.id); tableDrag.current = undefined }}
            onPointerDown={move ? event => { tableDrag.current = { key: table.id, moved: false, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) } : undefined}
            onPointerMove={move ? event => {
              const start = tableDrag.current
              if (!start || start.key !== table.id || !floor.current || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5 && !start.moved) return
              const box = floor.current.getBoundingClientRect()
              start.moved = true
              move({ ...table, x: Math.round(clamp((event.clientX - box.left) / box.width * 100, table.w / 2, 100 - table.w / 2) * 10) / 10,
                y: Math.round(clamp((event.clientY - box.top) / box.height * 100, table.h / 2, 100 - table.h / 2) * 10) / 10 })
            } : undefined}
            onPointerCancel={() => { tableDrag.current = undefined }}>
            <strong>{String(table.number).padStart(2, '0')}</strong>
            <span><Icon size={12}/>{order ? `${guestCount(order)} · ${owner}` : seatLabel(table.seats)}</span>
            <small>{tone === 'other' ? 'Занят' : title}</small>
          </button>
        })}
      </div>
    </div>
    <div className="zoom" aria-label="Масштаб карты">
      <button aria-label="Уменьшить" disabled={zoom <= 1} onClick={() => setZoom(value => value - .25)}><Minus size={18}/></button>
      <button aria-label="Сбросить масштаб" onClick={() => { setZoom(1); scroll.current?.scrollTo(0, 0) }}><Maximize size={16}/></button>
      <button aria-label="Увеличить" disabled={zoom >= 2} onClick={() => setZoom(value => value + .25)}><Plus size={18}/></button>
    </div>
  </div>
}
export function Hall({ data, branch, actor, open, now, mode, setMode, orders }: {
  data: Workspace; branch: string; actor: string; now: number; mode: 'map' | 'list'; setMode: (mode: 'map' | 'list') => void
  open: (table: string) => void; orders: () => void
}) {
  const directory = useDirectory()
  const tables = directory.layout
  const active = Object.values(data.active)
  const tasks = active.flatMap(order => linesOf(order).flatMap(line => {
    const delay = issue(line, now)
    return delay || line.status === 'ready' ? [{ order, line, delay }] : []
  })).sort((a, b) => Number(Boolean(b.delay)) - Number(Boolean(a.delay)))
  const free = tables.filter(table => !data.occupied[table.id]).length
  const ready = active.filter(order => linesOf(order).some(line => line.status === 'ready')).length
  return <div className="hall">
    <header className="hall-heading">
      <div><p className="hall-location">{directory.branches.find(item => item.id === branch)?.name}</p><h1>Зал</h1></div>
      <div className="segmented" aria-label="Вид зала">
        <button aria-pressed={mode === 'map'} onClick={() => setMode('map')}><Grid2X2 size={17}/> Карта</button>
        <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}><List size={17}/> Список</button>
      </div>
    </header>
    <div className="hall-summary" data-coach="hall-summary">
      <Chip tone="mine">{free} свободно</Chip><Chip tone="other">{active.length} занято</Chip><Chip tone="ready">{ready} к выдаче</Chip>
      <Chip tone="late">{active.filter(order => linesOf(order).some(line => issue(line, now))).length} с задержкой</Chip>
    </div>
    <div className="hall-grid">
      <section className="floor-panel">
        <h2 className="sr-only">План зала</h2>
        {mode === 'map' ? <Plan tables={tables} data={data} actor={actor} now={now} open={open}/> :
          <div className="table-list">{tables.map(table => {
            const order = data.active[data.occupied[table.id]]
            const [tone, title] = tableState(order, actor, now)
            return <button className="line-row" key={table.id} data-coach={table.id === 't1' ? 'table' : undefined} onClick={() => open(table.id)}>
              <div><strong>Стол {table.number}</strong><small>{order ? `${directory.person(order.owner)?.name ?? 'Коллега'} · ${guestCount(order)} гост. · ${minutes(order.opened, now)} мин` : table.zone}</small></div><Chip tone={tone}>{title}</Chip>
            </button>
          })}</div>}
      </section>
      <aside className="activity">
        <header className="row spread"><h2>Требуют внимания</h2><span className="counter">{tasks.length}</span></header>
        {tasks.length ? tasks.map(({ order, line, delay }) => <button key={line.id} className="attention-row" onClick={() => open(order.table)}>
          <span className={`stat-icon ${delay ? 'late' : 'ready'}`}>{delay ? <Clock3 size={17}/> : <Bell size={17}/>}</span>
          <span><strong>Стол {directory.table(order.table)} · {line.name}</strong><small>{delay || 'Готово к выдаче'}</small></span><ArrowRight size={16}/>
        </button>) : <Empty>Задержек и готовых блюд пока нет.</Empty>}
        <button className="text-button" onClick={orders}>Все заказы <ArrowRight size={16}/></button>
      </aside>
    </div>
  </div>
}
