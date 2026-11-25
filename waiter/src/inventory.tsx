import { useState } from 'react'
import { ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import type { Dish, Workspace } from './domain'
import { useDirectory } from './directory'
import type { Dispatch } from './orders'
import { Button, Dialog, Empty } from './ui'

export function Inventory({ data, dispatch }: { data: Workspace; dispatch: Dispatch }) {
  const [search, setSearch] = useState('')
  const [all, setAll] = useState(false)
  const [editing, setEditing] = useState('')
  const [mode, setMode] = useState('all')
  const [count, setCount] = useState(1)
  const [reason, setReason] = useState('')
  const [version, setVersion] = useState(0)
  const { catalog } = useDirectory()
  const available = (id: string) => data.stock[id]?.count ?? -1
  const needle = search.trim().toLocaleLowerCase('ru')
  const rows = catalog.filter(item => item.name.toLocaleLowerCase('ru').includes(needle) && (all || needle || available(item.id) >= 0))
  const groups = [
    { title: 'Закончилось', tone: 'late', rows: rows.filter(item => available(item.id) === 0) },
    { title: 'Осталось мало', tone: 'other', rows: rows.filter(item => available(item.id) > 0) },
    { title: 'В наличии', tone: 'mine', rows: rows.filter(item => available(item.id) < 0) }
  ]
  const selected = catalog.find(item => item.id === editing)
  function edit(item: Dish) {
    const current = data.stock[item.id]
    const stock = available(item.id)
    setEditing(item.id); setMode(stock < 0 ? 'all' : stock === 0 ? 'stop' : 'limit')
    setCount(Math.max(1, stock)); setReason(current?.reason ?? ''); setVersion(current?.version ?? 0)
  }
  return <div className="inventory-view stack">
    <header className="mobile-section-head"><h1>Стоп-лист</h1><Button onClick={() => setAll(value => !value)}><SlidersHorizontal size={17}/>{all ? 'Только остатки' : 'Все блюда'}</Button></header>
    <label className="search inventory-search"><Search size={17}/><input type="search" placeholder="Найти блюдо" aria-label="Поиск блюд" value={search} onChange={event => setSearch(event.target.value)}/></label>
    <div className="inventory-list stock-groups" data-coach="stock">
      {!rows.length && <Empty>{needle || all ? 'Блюда не найдены.' : 'Ограниченных позиций нет.'}</Empty>}
      {groups.filter(group => group.rows.length).map(group => <section key={group.title} className={`stock-group ${group.tone}`}>
        <h2><i aria-hidden="true"/>{group.title}<small>{group.rows.length}</small></h2>
        <div className="stock-rows">{group.rows.map(item => <button className="line-row stock-row" key={item.id} onClick={() => edit(item)}>
          <span><strong>{item.name}</strong>{data.stock[item.id]?.reason && <small>{data.stock[item.id].reason}</small>}</span>
          {available(item.id) > 0 && <span className="stock-quantity">{available(item.id)}<small>порц.</small></span>}
          <ChevronRight size={17} aria-hidden="true"/>
        </button>)}</div>
      </section>)}
    </div>
    {selected && <Dialog sheet title={selected.name} close={() => setEditing('')}>
      <form className="stack" onSubmit={async event => { event.preventDefault(); if (await dispatch({ type: 'stock', item: selected.id, count: mode === 'all' ? -1 : mode === 'stop' ? 0 : count, reason, version })) setEditing('') }}>
        <label>Наличие<select value={mode} onChange={event => setMode(event.target.value)}><option value="all">Без ограничений</option><option value="limit">Ограниченный остаток</option><option value="stop">В стоп-листе</option></select></label>
        {mode === 'limit' && <label>Количество порций<input value={Number.isNaN(count) ? '' : count} min="1" max="99" required type="number" inputMode="numeric" onChange={event => setCount(event.target.valueAsNumber)}/></label>}
        <label>Комментарий<input value={reason} maxLength={160} onChange={event => setReason(event.target.value)}/></label>
        <Button type="submit" primary>Сохранить наличие</Button>
      </form>
    </Dialog>}
  </div>
}
