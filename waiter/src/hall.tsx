import { useState } from 'react'
import { ArrowDownLeft, ArrowRight, Armchair, Bell, CircleAlert, Clock3, Coffee, Grid2X2, List, MapPin, Minus, Plus, Users } from 'lucide-react'
import { guestCount, issue, linesOf, minutes, tableState, type Order, type Tone, type Workspace } from './domain'
import { branches, firstName, tableNumber, tablesFor } from './fixtures'
import { Chip, Empty, ScreenTitle } from './ui'

const statusIcon = { free: Armchair, mine: Users, other: Users, ready: Bell, late: CircleAlert }
export function Hall({ data, branch, actor, open, now, mode, setMode, orders }: {
  data: Workspace; branch: string; actor: string; now: number; mode: 'map' | 'list'; setMode: (mode: 'map' | 'list') => void
  open: (table: string) => void; orders: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const tables = tablesFor(branch)
  const active = Object.values(data.active)
  const tasks = active.flatMap(order => linesOf(order).flatMap(line => {
    const delay = issue(line, now)
    return delay || line.status === 'ready' ? [{ order, line, delay }] : []
  })).sort((a, b) => Number(Boolean(b.delay)) - Number(Boolean(a.delay)))
  const stats = [
    { title: 'Свободные столы', count: tables.length - active.length, icon: Armchair, tone: 'free' },
    { title: 'В обслуживании', count: active.length, icon: Users, tone: 'mine' },
    { title: 'К выдаче', count: active.filter(order => linesOf(order).some(line => line.status === 'ready')).length, icon: Bell, tone: 'ready' },
    { title: 'С задержкой', count: active.filter(order => linesOf(order).some(line => issue(line, now))).length, icon: Clock3, tone: 'late' }
  ]
  const location = branches.find(item => item.id === branch)
  return <>
    <ScreenTitle title="Зал" action={<span className="location-pill"><MapPin size={16}/>{location?.name}</span>}>Управляйте столами и следите за обслуживанием гостей.</ScreenTitle>
    <div className="stats-grid">{stats.map(stat => <div className="panel stat" key={stat.title}><div className={`stat-icon ${stat.tone}`}><stat.icon size={19}/></div><div><strong>{stat.count}</strong><small>{stat.title}</small></div></div>)}</div>
    <div className="hall-grid">
      <section className="panel floor-panel">
        <header className="row spread floor-header">
          <div><h2>План зала</h2><p className="muted">{tables.length} столов · 2 зоны</p></div>
          <div className="segmented" aria-label="Вид зала">
            <button aria-pressed={mode === 'map'} onClick={() => setMode('map')}><Grid2X2 size={16}/> Карта</button>
            <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}><List size={17}/> Список</button>
          </div>
        </header>
        {mode === 'map' ? <div className="floor-wrap">
          <div className="floor-scroller">
            <div className={`floor ${branch}`} style={{ width: `${100 * zoom}%`, height: `${385 * zoom}px` }}>
              <div className="floor-zone top">У ОКНА</div><div className="floor-zone lower">ОСНОВНОЙ ЗАЛ</div>
              <div className="window-line"/><div className="divider-line"/>
              <div className="desk"><Coffee size={14}/><span>Бар · касса</span></div>
              <div className="entry"><ArrowDownLeft size={15}/> Вход</div>
              {tables.map(table => {
                const order = data.active[data.occupied[table.id]]
                const [tone, title] = tableState(order, actor, now)
                const Icon = statusIcon[tone]
                return <button key={table.id} className={`map-table ${tone} ${table.round ? 'round' : ''}`}
                  style={{ left: `${table.x}%`, top: `${table.y}%`, width: `${table.w}%`, height: `${table.h}%` }}
                  aria-label={`Стол ${table.number}, ${title}${order ? ', ' + guestCount(order) + ' гостей, ' + firstName(order.owner) : ''}`}
                  title={order ? `${title} · ${firstName(order.owner)} · ${minutes(order.opened, now)} мин` : title} onClick={() => open(table.id)}>
                  <strong>{String(table.number).padStart(2, '0')}</strong>
                  <span><Icon size={11}/>{order ? `${guestCount(order)} · ${firstName(order.owner)}` : table.seats + ' места'}</span>
                  {order && <small>{minutes(order.opened, now)} мин · {title}</small>}
                </button>
              })}
            </div>
          </div>
          <div className="zoom"><button aria-label="Уменьшить" disabled={zoom <= 1} onClick={() => setZoom(value => value - .25)}><Minus size={17}/></button><button aria-label="Увеличить" disabled={zoom >= 2} onClick={() => setZoom(value => value + .25)}><Plus size={17}/></button></div>
        </div> : <div className="table-list">{tables.map(table => {
          const order = data.active[data.occupied[table.id]]
          const [tone, title] = tableState(order, actor, now)
          return <button className="line-row" key={table.id} onClick={() => open(table.id)}><div><strong>Стол {table.number}</strong><small>{order ? `${firstName(order.owner)} · ${guestCount(order)} гост. · ${minutes(order.opened, now)} мин` : table.zone}</small></div><Chip tone={tone}>{title}</Chip></button>
        })}</div>}
        <footer className="legend">{([['free', 'Свободен'], ['mine', 'Мой стол'], ['other', 'Другой официант'], ['ready', 'Выдача / расчёт'], ['late', 'Задержка']] as [Tone, string][]).map(([tone, name]) => <Chip key={tone} tone={tone}>{name}</Chip>)}</footer>
      </section>
      <aside className="panel activity">
        <header className="row spread"><div><h2>Требуют внимания</h2><p className="muted">Выдача и задержки</p></div><span className="counter">{tasks.length}</span></header>
        {tasks.length ? tasks.map(({ order, line, delay }) => <button key={line.id} className="attention-row" onClick={() => open(order.table)}>
          <span className={`stat-icon ${delay ? 'late' : 'ready'}`}>{delay ? <Clock3 size={17}/> : <Bell size={17}/>}</span>
          <span><strong>Стол {tableNumber(order.table)} · {line.name}</strong><small>{delay || 'Готово к выдаче'}</small></span><ArrowRight size={15}/>
        </button>) : <Empty>Сейчас нет задержек и готовых блюд.</Empty>}
        <button className="text-button" onClick={orders}>Все заказы <ArrowRight size={16}/></button>
      </aside>
    </div>
  </>
}

export const tableTitle = (order: Order) => `Стол ${tableNumber(order.table)}`
