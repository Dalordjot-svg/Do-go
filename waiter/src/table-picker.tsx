import { useState } from 'react'
import { LayoutGrid, Users } from 'lucide-react'
import { guestCount, tableState, type Table, type Workspace } from './domain'
import { useDirectory } from './directory'
import { Dialog, Empty } from './ui'

type Filter = 'Свободные' | 'Мои' | 'Все'

export function TableGroups({ tables, data, actor, now, open }: {
  tables: Table[]; data: Workspace; actor: string; now: number; open: (key: string) => void
}) {
  const directory = useDirectory()
  const zones = [...new Set(tables.map(table => table.zone || 'Зал'))]
  if (!zones.length) return <Empty>Столов с таким статусом нет.</Empty>
  return <div className="table-groups">
    {zones.map(zone => <section key={zone} className="table-zone">
      <h3><LayoutGrid size={15}/>{zone}</h3>
      <div className="table-tiles">{tables.filter(table => (table.zone || 'Зал') === zone).map(table => {
        const order = data.active[data.occupied[table.id]]
        const [tone, status] = tableState(order, actor, now)
        const owner = order && directory.person(order.owner)?.name
        return <button key={table.id} className={`table-tile ${tone}`} data-coach={table.id === 't1' ? 'table' : undefined}
          aria-label={`Стол ${table.number}, ${status}${owner ? ', ' + owner : ''}`} onClick={() => open(table.id)}>
          <span className="row spread"><strong>{table.number}</strong><i aria-hidden="true"/></span>
          <span className="tile-detail">{owner ? owner.split(' ')[0] : status}</span>
          <small><Users size={13}/>{order ? guestCount(order) : table.seats}{order && tone === 'late' ? ' · задержка' : ''}</small>
        </button>
      })}</div>
    </section>)}
  </div>
}

export function TablePicker({ data, actor, now, choose, close, initialFilter }: {
  data: Workspace; actor: string; now: number; choose: (key: string) => void; close: () => void; initialFilter: Filter
}) {
  const { layout } = useDirectory()
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const tables = layout.filter(table => filter === 'Все' || (filter === 'Мои' ?
    data.active[data.occupied[table.id]]?.owner === actor : !data.occupied[table.id]))
  return <Dialog sheet title="Столы смены" close={close}>
    <div className="segmented" aria-label="Фильтр столов">{(['Свободные', 'Мои', 'Все'] as const).map(item =>
      <button key={item} aria-pressed={item === filter} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <TableGroups tables={tables} data={data} actor={actor} now={now} open={choose}/>
  </Dialog>
}
