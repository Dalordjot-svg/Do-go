import { useState } from 'react'
import { LogOut, Receipt, Users } from 'lucide-react'
import { guestCount, money, paid, type Order, type Staff } from './domain'
import { Avatar, Button, Chip } from './ui'

const ranges = ['День', 'Неделя', 'Месяц'] as const

function periodBuckets(now: number, range: typeof ranges[number]) {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  if (range === 'День') return Array.from({ length: 6 }, (_, index) => {
    const from = new Date(midnight), to = new Date(midnight)
    from.setHours(index * 4); to.setHours((index + 1) * 4)
    return { from: +from, to: +to, label: from.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }
  })
  const week = range === 'Неделя'
  const length = week ? 7 : 6
  const period = week ? 1 : 5
  return Array.from({ length }, (_, index) => {
    const from = new Date(midnight)
    from.setDate(from.getDate() - (length - index) * period + 1)
    // Build the end from the start so month boundaries and local daylight changes are preserved.
    const until = new Date(from)
    until.setDate(until.getDate() + period)
    return { from: +from, to: +until, label: from.toLocaleDateString('ru-RU', week ? { weekday: 'short' } : { day: '2-digit', month: '2-digit' }) }
  })
}
export function ProfileOverview({ user, branch, status, online, archive, active, now, signOut }: {
  user: Staff; branch: string | undefined; status: string; online: boolean; archive: Order[]; active: number; now: number; signOut?: () => void
}) {
  const [range, setRange] = useState<typeof ranges[number]>('День')
  const sales = periodBuckets(now, range).map(bucket => ({
    ...bucket, value: archive.filter(order => order.ended !== undefined && order.ended >= bucket.from && order.ended < bucket.to)
      .reduce((sum, order) => sum + paid(order), 0)
  }))
  const total = sales.reduce((sum, bucket) => sum + bucket.value, 0)
  const high = Math.max(1, ...sales.map(bucket => bucket.value))
  return <>
    <header className="mobile-section-head"><h1>Профиль</h1>{signOut && <Button onClick={signOut}><LogOut size={17}/> Выйти из профиля</Button>}</header>
    <div className="profile-identity">
      <Avatar actor={user.id}/><div><h2>{user.name}</h2><p className="muted">{user.role}{branch && ' · ' + branch}</p><Chip tone={online ? 'mine' : 'free'}>{status}</Chip></div>
    </div>
    <section className="profile-sales panel">
      <div className="profile-sales-head"><div><h2>Личные продажи</h2><strong>{money(total)}</strong></div>
        <div className="segmented" aria-label="Период продаж">{ranges.map(value =>
          <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{value}</button>)}</div>
      </div>
      <ul className="sales-chart" role="list" aria-label={`Продажи: ${range.toLowerCase()}`}>{sales.map(bucket => <li key={bucket.from} aria-label={`${bucket.label}: ${money(bucket.value)}`}>
        <div className="sales-track" title={money(bucket.value)}><span style={{ height: `${bucket.value / high * 100}%` }}/></div><small>{bucket.label}</small>
      </li>)}</ul>
      <p className="muted">Учитываются ваши закрытые заказы.</p>
    </section>
    <div className="profile-facts">
      <span><Users size={16}/><small>Гости</small><strong>{archive.reduce((sum, order) => sum + guestCount(order), 0)}</strong></span>
      <span><Receipt size={16}/><small>Закрыто</small><strong>{archive.length}</strong></span>
      <span><small>Активные столы</small><strong>{active}</strong></span>
      <span><small>Средний чек</small><strong>{money(archive.length ? Math.round(archive.reduce((sum, order) => sum + paid(order), 0) / archive.length) : 0)}</strong></span>
    </div>
  </>
}
