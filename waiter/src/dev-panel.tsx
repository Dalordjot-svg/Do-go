import { useState } from 'react'
import { id, linesOf, type Workspace } from './domain'
import { dish, makeLine } from './fixtures'
import type { Dispatch } from './orders'
import { versions } from './orders'
import { listenerCount, remoteEnabled, simulateNetwork } from './remote'
import { enqueue, local, resetLocal, useWork } from './storage'
import { Button } from './ui'

export default function DevPanel({ data, branch, actor, dispatch, training }: { data: Workspace; branch: string; actor: string; dispatch: Dispatch; training: () => void }) {
  const [report, setReport] = useState('')
  const [confirm, setConfirm] = useState(false)
  const sync = useWork()
  const first = Object.values(data.active)[0]
  return <details className="panel pad"><summary>Панель разработчика</summary><div className="stack">
    <p className="muted">Слушателей Firebase: {listenerCount()} · очередь: {sync.queue.length} · {sync.error || 'ошибок нет'}</p>
    <div className="row wrap">
      <Button onClick={() => {
        if (remoteEnabled) simulateNetwork(!sync.online)
        else useWork.setState({ online: !sync.online })
      }}>{sync.online ? 'Отключить сеть' : 'Восстановить сеть'}</Button>
      <Button onClick={() => useWork.setState({ slow: !sync.slow })}>{sync.slow ? 'Вернуть обычную скорость' : 'Медленное соединение'}</Button>
      <Button onClick={training}>Сбросить обучение</Button>
      <Button disabled={!first} onClick={() => { void enqueue(branch, actor === 'lena' ? 'artem' : 'lena', { type: 'note', order: first.id, previous: first.note, note: `Тест коллеги ${id().slice(0, 4)}` }) }}>Действие коллеги</Button>
      <Button disabled={!first} onClick={() => {
        const line = linesOf(first).find(item => item.status === 'accepted')
        if (line) void dispatch({ type: 'status', order: first.id, lines: versions([line]), status: 'cooking' })
        else setReport('В первом заказе нет принятых блюд.')
      }}>Начать приготовление</Button>
      <Button disabled={!first} onClick={() => {
        const line = linesOf(first).find(item => ['accepted', 'cooking'].includes(item.status))
        if (line) void dispatch({ type: 'status', order: first.id, lines: versions([line]), status: 'ready' })
        else setReport('В первом заказе нет готовящихся блюд.')
      }}>Готовность блюда</Button>
      <Button disabled={!first} onClick={() => { void dispatch({ type: 'add', order: first.id, line: makeLine(dish('d7-0')!, actor) }) }}>Добавить чизкейк</Button>
      <Button onClick={() => {
        const stock = data.stock['d7-0']
        void dispatch({ type: 'stock', item: 'd7-0', count: 1, reason: 'Проверка последней порции', version: stock?.version ?? 0 })
      }}>Оставить одну порцию</Button>
      <Button onClick={() => { void Promise.all([local.snapshots.count(), local.messages.count(), local.settings.count(), globalThis.caches?.keys()]).then(([snapshots, messages, settings, caches]) =>
        setReport(JSON.stringify({ snapshots, messages, settings, caches, queue: sync.queue }, null, 2))) }}>Состояние локальной базы</Button>
      <Button onClick={() => {
        if (!confirm) setConfirm(true)
        else void resetLocal().then(() => location.reload())
      }}>{confirm ? 'Подтвердить локальный сброс' : 'Сбросить локальные данные'}</Button>
    </div>
    {report && <pre className="dev-report">{report}</pre>}
  </div></details>
}
