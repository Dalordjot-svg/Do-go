import { eventNames, issue, linesOf, type Link, type Message, type Workspace } from './domain'
import type { getDirectory } from './directory'
import type { Queued } from './storage'
export interface Alert { id: string; title: string; at: number; link?: Link; chat?: string }
export function getAlerts(data: Workspace, actor: string, now: number, queue: Queued[], loaded: Record<string, Message[]>, directory: ReturnType<typeof getDirectory>): Alert[] {
  const firstName = (id: string) => directory.person(id)?.name.split(' ')[0] ?? 'Коллега'
  const alerts: Alert[] = []
  for (const order of Object.values(data.active)) {
    if (order.owner !== actor) continue
    for (const line of linesOf(order)) {
      const delay = issue(line, now)
      if (delay || line.status === 'ready') alerts.push({
        id: `${line.id}:${line.changedAt}:${delay || 'ready'}`, at: line.changedAt,
        title: `Стол ${directory.table(order.table)} · ${line.name} · ${delay || 'готово к выдаче'}`, link: { kind: 'order', key: order.id }
      })
    }
  }
  for (const event of Object.values(data.audit)) {
    if (event.actor === actor) continue
    const order = event.order && data.active[event.order]
    if (event.kind === 'transfer' && JSON.parse(event.after) === actor) {
      const previous = JSON.parse(event.before) as Record<string, string>
      for (const key of Object.keys(previous)) if (data.active[key]) alerts.push({ id: event.id + key, at: event.at, title: `Стол ${directory.table(data.active[key].table)} передан вам`, link: { kind: 'order', key } })
    }
    if (event.kind === 'stock' && event.item) alerts.push({ id: event.id, at: event.at,
      title: `${directory.catalog.find(item => item.id === event.item)?.name ?? event.item} · ${(JSON.parse(event.after) as { count: number }).count === 0 ? 'блюдо закончилось' : 'остаток изменился'}`,
      link: { kind: 'dish', key: event.item } })
    if (order && order.owner === actor) alerts.push({ id: event.id, at: event.at, title: `${firstName(event.actor)} · ${eventNames[event.kind]} · стол ${directory.table(order.table)}`, link: { kind: 'order', key: order.id } })
  }
  for (const [chat, messages] of Object.entries(loaded)) {
    for (const message of messages.slice(-8)) if (message.actor !== actor) alerts.push({ id: 'msg-' + message.id, at: message.at, title: `${firstName(message.actor)} · ${message.text.slice(0, 90)}`, chat })
  }
  for (const operation of queue) if (operation.rejected) alerts.push({
    id: operation.id, at: operation.at, title: operation.rejected,
    ...('order' in operation.command ? { link: { kind: 'order', key: operation.command.order } } : {})
  })
  return alerts.sort((a, b) => b.at - a.at).slice(0, 45)
}
