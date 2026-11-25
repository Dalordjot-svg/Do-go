import { useState } from 'react'
import { Search } from 'lucide-react'
import type { Workspace } from './domain'
import { menu } from './fixtures'
import type { Dispatch } from './orders'
import { Button, Chip, Empty, ScreenTitle } from './ui'

export function Inventory({ data, dispatch }: { data: Workspace; dispatch: Dispatch }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Ограничено')
  const [editing, setEditing] = useState('')
  const [mode, setMode] = useState('all')
  const [count, setCount] = useState(1)
  const [reason, setReason] = useState('')
  const [version, setVersion] = useState(0)
  const rows = menu.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()) &&
    (filter === 'Все блюда' || (data.stock[item.id]?.count ?? -1) >= 0))
  return <div className="stack">
    <ScreenTitle title="Стоп-лист">Проверяйте доступность блюд и обновляйте остатки.</ScreenTitle>
    <div className="row wrap"><div className="segmented">{['Ограничено', 'Все блюда'].map(key => <button key={key} onClick={() => setFilter(key)} aria-pressed={key === filter}>{key}</button>)}</div>
      <label className="search"><Search size={17}/><input placeholder="Найти блюдо" aria-label="Поиск блюд" value={search} onChange={event => setSearch(event.target.value)}/></label></div>
    {!rows.length && <Empty>Блюда не найдены.</Empty>}
    <div className="panel pad">{rows.map(item => {
      const current = data.stock[item.id]
      const available = current?.count ?? -1
      return <div key={item.id}>
        <button className="line-row" onClick={() => { setEditing(key => key === item.id ? '' : item.id); setMode(available < 0 ? 'all' : available === 0 ? 'stop' : 'limit'); setCount(Math.max(1, available)); setReason(current?.reason ?? ''); setVersion(current?.version ?? 0) }}>
          <span><strong>{item.name}</strong><small>{current?.reason || item.category}</small></span>
          <Chip tone={available === 0 ? 'late' : available > 0 ? 'other' : 'mine'}>{available < 0 ? 'В наличии' : available === 0 ? 'Стоп-лист' : `${available} порц.`}</Chip>
        </button>
        {editing === item.id && <form className="stack pad" onSubmit={async event => { event.preventDefault(); if (await dispatch({ type: 'stock', item: item.id, count: mode === 'all' ? -1 : mode === 'stop' ? 0 : count, reason, version })) setEditing('') }}>
          <label>Наличие<select value={mode} onChange={event => setMode(event.target.value)}><option value="all">Без ограничений</option><option value="limit">Ограниченный остаток</option><option value="stop">В стоп-листе</option></select></label>
          {mode === 'limit' && <label>Количество порций<input value={Number.isNaN(count) ? '' : count} min="1" max="99" required type="number" onChange={event => setCount(event.target.valueAsNumber)}/></label>}
          <label>Комментарий<input value={reason} maxLength={160} onChange={event => setReason(event.target.value)}/></label>
          <Button type="submit" primary>Сохранить наличие</Button>
        </form>}
      </div>
    })}</div>
  </div>
}
