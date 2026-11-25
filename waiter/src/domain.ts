export type Tone = 'free' | 'mine' | 'other' | 'ready' | 'late'
export type Status = 'draft' | 'accepted' | 'cooking' | 'ready' | 'served' | 'cancelled'
export const labels: Record<Status, string> = { draft: 'Черновик', accepted: 'Принято', cooking: 'Готовится', ready: 'Готово', served: 'Выдано', cancelled: 'Отменено' }
export const courses = ['Подать сразу', 'Вместе с основным', 'После еды', 'По запросу'] as const
export const shared = 'shared'
export const id = () => globalThis.crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
export const money = (amount: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount / 100) + ' ₽'
export const minutes = (at: number, now: number) => Math.max(0, Math.floor((now - at) / 60000))

export interface Dish { id: string; name: string; category: string; price: number; description: string; allergens: string; prep: number; wait: number; modifiers: string[]; popular: boolean }
export interface Seat { id: string; name: string }
export interface Table { id: string; number: number; seats: number; x: number; y: number; w: number; h: number; round?: boolean; zone: string }
export interface Staff { id: string; name: string; initials: string; role: string; color: string }
export interface Line {
  id: string; item: string; name: string; price: number; quantity: number; guest: string; modifiers: string
  note: string; course: typeof courses[number]; status: Status; createdAt: number; changedAt: number
  actor: string; version: number; prep: number; wait: number; reserved?: string; cancellation?: string; prepStartedAt?: number
}
export interface Order {
  id: string; table: string; owner: string; opened: number; guests: Record<string, Seat>; lines: Record<string, Line>
  note: string; state: 'active' | 'bill' | 'closed' | 'cancelled' | 'merged'; ended?: number; mergedInto?: string
  payments?: Record<string, number>; paidLines?: Record<string, number>
}
export interface Stock { count: number; reason: string; version: number; generation: string }
export interface Event { id: string; operation: string; actor: string; kind: Command['type']; order?: string; item?: string; at: number; before: string; after: string }
export interface Workspace {
  revision: number; active: Record<string, Order>; archived: Record<string, Order>; occupied: Record<string, string>
  stock: Record<string, Stock>; audit: Record<string, Event>; receipts: Record<string, { result: string; at: number }>
}
export type Link = { kind: 'table' | 'order' | 'dish'; key: string }
export interface Message { id: string; actor: string; text: string; at: number; link?: Link; reply?: string }
type Patch = Partial<Pick<Line, 'quantity' | 'guest' | 'modifiers' | 'note' | 'course'>>
export type Command =
  | { type: 'open'; order: string; table: string; guests: Record<string, Seat> }
  | { type: 'add'; order: string; line: Line }
  | { type: 'edit'; order: string; line: string; version: number; patch: Patch }
  | { type: 'remove'; order: string; line: string; version: number }
  | { type: 'send'; order: string; lines: Record<string, number> }
  | { type: 'status'; order: string; lines: Record<string, number>; status: 'cooking' | 'ready' | 'served' }
  | { type: 'void'; order: string; line: string; version: number; reason: string; restock: boolean }
  | { type: 'guest'; order: string; seat: Seat; remove?: boolean }
  | { type: 'note'; order: string; note: string; previous: string }
  | { type: 'stock'; item: string; count: number; reason: string; version: number }
  | { type: 'transfer'; orders: Record<string, string>; owner: string }
  | { type: 'move'; order: string; from: string; table: string }
  | { type: 'merge'; order: string; into: string }
  | { type: 'bill'; order: string }
  | { type: 'pay'; order: string; lines: Record<string, number>; payments: Record<string, number> }
  | { type: 'close'; order: string; cancel?: boolean }
  | { type: 'message'; chat: string; message: Message }

export interface Operation { id: string; actor: string; branch: string; at: number; command: Command }
export const eventNames: Record<Command['type'], string> = {
  open: 'Открытие стола', add: 'Добавление блюда', edit: 'Изменение позиции', remove: 'Удаление черновика',
  send: 'Подтверждение заказа', status: 'Статус приготовления и выдачи', void: 'Отмена позиции', guest: 'Изменение гостей',
  note: 'Комментарий к заказу', stock: 'Изменение наличия', transfer: 'Передача стола', move: 'Перенос стола',
  merge: 'Объединение заказов', bill: 'Запрошен расчёт', pay: 'Тестовая оплата', close: 'Закрытие заказа', message: 'Сообщение'
}
export const linesOf = (order: Order) => Object.values(order.lines ?? {}).filter(line => line.status !== 'cancelled')
export const guestCount = (order: Order) => Object.keys(order.guests ?? {}).length
export const total = (order: Order) => linesOf(order).reduce((sum, line) => sum + line.quantity * line.price, 0)
export const paid = (order: Order) => Object.values(order.payments ?? {}).reduce((a, b) => a + b, 0)
export const isCritical = (command: Command) => !['add', 'edit', 'remove', 'guest', 'note'].includes(command.type)
export const issue = (line: Line, now: number) => {
  if (line.status === 'ready' && minutes(line.changedAt, now) >= line.wait + 5) return 'Нет отметки о выдаче'
  if (line.status === 'ready' && minutes(line.changedAt, now) >= line.wait) return 'Ожидает выдачи'
  if (['accepted', 'cooking'].includes(line.status) && minutes(line.prepStartedAt ?? line.changedAt, now) >= line.prep) return 'Задержка приготовления'
  return ''
}
export function tableState(order: Order | undefined, actor: string, now: number): [Tone, string] {
  if (!order) return ['free', 'Свободен']
  if (linesOf(order).some(line => issue(line, now))) return ['late', 'Задержка']
  if (order.state === 'bill') return ['ready', 'К расчёту']
  if (linesOf(order).some(line => line.status === 'ready')) return ['ready', 'К выдаче']
  return order.owner === actor ? ['mine', 'Мой стол'] : ['other', 'Обслуживается']
}
export function splitBill(order: Order) {
  const guests = Object.keys(order.guests ?? {})
  const shares: Record<string, number> = Object.fromEntries(guests.map(guest => [guest, 0]))
  for (const line of linesOf(order)) {
    const amount = line.quantity * line.price
    if (line.guest !== shared || !guests.length) shares[line.guest] = (shares[line.guest] ?? 0) + amount
    else guests.forEach((guest, index) => { shares[guest] += Math.floor(amount / guests.length) + Number(index < amount % guests.length) })
  }
  return shares
}

export function normalize(input: Workspace): Workspace {
  const state = structuredClone(input)
  state.active ??= {}
  state.archived ??= {}
  state.occupied ??= {}
  state.stock ??= {}
  state.audit ??= {}
  state.receipts ??= {}
  for (const order of [...Object.values(state.active), ...Object.values(state.archived)]) {
    order.guests ??= {}
    order.lines ??= {}
  }
  return state
}

class Conflict extends Error {}
const check = (condition: unknown, message: string) => { if (!condition) throw new Conflict(message) }
const validCount = (n: number) => Number.isSafeInteger(n) && n >= 1 && n <= 99

export function apply(input: Workspace, operation: Operation, at: number, optimistic = false): { state: Workspace; error: string } {
  if (input.receipts?.[operation.id]) return { state: input, error: input.receipts[operation.id].result }
  const state = normalize(input)
  const { command: c, actor } = operation
  let before: unknown = ''
  let after: unknown = ''
  let item: string | undefined
  const orderId = 'order' in c ? c.order : undefined
  const requireOrder = (key: string) => {
    const order = state.active[key]
    check(order, 'Заказ уже закрыт или перемещён')
    return order
  }
  const requireLine = (order: Order, key: string, version: number) => {
    const line = order.lines[key]
    check(line?.version === version, 'Позиция изменилась на другом устройстве')
    check(order.paidLines?.[key] === undefined, 'Позиция уже оплачена')
    return line
  }
  const inventory = (key: string) => state.stock[key] ?? { count: -1, reason: '', version: 0, generation: 'initial' }
  let error = ''
  try {
    switch (c.type) {
      case 'open':
        check(!state.occupied[c.table], 'Стол уже занят')
        check(validCount(Object.keys(c.guests).length), 'Укажите количество гостей')
        state.active[c.order] = { id: c.order, table: c.table, owner: actor, opened: at, guests: c.guests, lines: {}, note: '', state: 'active' }
        state.occupied[c.table] = c.order
        after = c.table
        break
      case 'add': {
        const order = requireOrder(c.order)
        check(inventory(c.line.item).count !== 0, 'Блюдо в стоп-листе')
        check(order.guests[c.line.guest] || c.line.guest === shared, 'Гость был удалён')
        check(!order.lines[c.line.id], 'Позиция уже добавлена')
        order.lines[c.line.id] = { ...c.line, createdAt: at, changedAt: at }
        after = c.line
        item = c.line.item
        break
      }
      case 'edit':
      case 'remove': {
        const order = requireOrder(c.order)
        const line = requireLine(order, c.line, c.version)
        before = line
        item = line.item
        if (c.type === 'remove') {
          check(line.status === 'draft', 'Подтверждённую позицию можно только отменить')
          delete order.lines[c.line]
        } else {
          check(!['cancelled', 'served'].includes(line.status), 'Позиция закрыта для редактирования')
          check(c.patch.quantity === undefined || (line.status === 'draft' && validCount(c.patch.quantity)), 'Количество можно менять в черновике')
          check(!c.patch.guest || c.patch.guest === shared || order.guests[c.patch.guest], 'Гость был удалён')
          order.lines[c.line] = { ...line, ...c.patch, version: line.version + 1 }
          after = order.lines[c.line]
        }
        break
      }
      case 'send':
      case 'status': {
        const order = requireOrder(c.order)
        const entries = Object.entries(c.lines)
        check(entries.length > 0, 'Нет выбранных позиций')
        const lines = entries.map(([key, version]) => requireLine(order, key, version))
        before = lines.map(line => [line.id, line.status])
        const used = new Map<string, number>()
        for (const line of lines) {
          if (c.type === 'send') {
            check(line.status === 'draft', 'Подтвердить можно только черновики')
            used.set(line.item, (used.get(line.item) ?? 0) + line.quantity)
          } else {
            const allowed = c.status === 'cooking' ? ['accepted'] : c.status === 'ready' ? ['accepted', 'cooking', 'served'] : ['ready']
            check(allowed.includes(line.status), 'Этот переход статуса недоступен')
          }
        }
        for (const [key, quantity] of used) {
          const stock = inventory(key)
          check(stock.count < 0 || stock.count >= quantity, 'Недостаточно порций: ' + lines.find(line => line.item === key)?.name)
          if (stock.count >= 0) state.stock[key] = { ...stock, count: stock.count - quantity, version: stock.version + 1 }
        }
        for (const line of lines) {
          const status = c.type === 'send' ? 'accepted' : c.status
          const stock = inventory(line.item)
          order.lines[line.id] = {
            ...line, status, changedAt: at, version: line.version + 1,
            ...(c.type === 'send' ? { prepStartedAt: at, ...(stock.count >= 0 ? { reserved: stock.generation } : {}) } : {})
          }
        }
        after = lines.map(line => [line.id, order.lines[line.id].status])
        break
      }
      case 'void': {
        const order = requireOrder(c.order)
        const line = requireLine(order, c.line, c.version)
        check(!['draft', 'cancelled', 'served'].includes(line.status) && c.reason.trim(), 'Укажите причину отмены')
        const stock = inventory(line.item)
        if (c.restock) {
          check(line.status === 'accepted' && stock.count >= 0 && line.reserved === stock.generation, 'Возврат остатка недоступен')
          state.stock[line.item] = { ...stock, count: stock.count + line.quantity, version: stock.version + 1 }
        }
        before = line
        item = line.item
        order.lines[c.line] = { ...line, status: 'cancelled', cancellation: c.reason, changedAt: at, version: line.version + 1 }
        after = order.lines[c.line]
        break
      }
      case 'guest': {
        const order = requireOrder(c.order)
        before = order.guests[c.seat.id]?.name ?? ''
        if (c.remove) {
          check(guestCount(order) > 1 && !linesOf(order).some(line => line.guest === c.seat.id), 'Удалить можно только свободную персону')
          delete order.guests[c.seat.id]
        } else {
          check(guestCount(order) < 99 || order.guests[c.seat.id], 'Достигнут лимит гостей')
          order.guests[c.seat.id] = c.seat
          after = c.seat.name
        }
        break
      }
      case 'note': {
        const order = requireOrder(c.order)
        before = order.note
        check(order.note === c.previous, 'Комментарий изменился на другом устройстве')
        order.note = c.note
        after = c.note
        break
      }
      case 'stock': {
        const stock = inventory(c.item)
        check(stock.version === c.version, 'Остаток уже изменился')
        check(c.count === -1 || c.count === 0 || validCount(c.count), 'Допустимый остаток от 0 до 99')
        before = stock
        item = c.item
        state.stock[c.item] = { count: c.count, reason: c.reason, version: stock.version + 1, generation: operation.id }
        after = state.stock[c.item]
        break
      }
      case 'transfer': {
        for (const [key, owner] of Object.entries(c.orders)) check(requireOrder(key).owner === owner, 'Ответственный уже изменился')
        before = c.orders
        for (const key of Object.keys(c.orders)) requireOrder(key).owner = c.owner
        after = c.owner
        break
      }
      case 'move': {
        const order = requireOrder(c.order)
        check(order.table === c.from && !state.occupied[c.table], 'Стол недоступен для переноса')
        before = order.table
        delete state.occupied[order.table]
        order.table = c.table
        state.occupied[c.table] = order.id
        after = c.table
        break
      }
      case 'merge': {
        const order = requireOrder(c.order)
        const target = requireOrder(c.into)
        check(order.id !== target.id && !paid(order) && !paid(target), 'Объединение недоступно после оплаты')
        target.lines = { ...target.lines, ...order.lines }
        target.guests = { ...target.guests, ...order.guests }
        target.note = [target.note, order.note].filter(Boolean).join('\n')
        state.archived[order.id] = { ...order, state: 'merged', mergedInto: target.id, ended: at }
        delete state.active[order.id]
        delete state.occupied[order.table]
        before = order.table
        after = { order: target.id, table: target.table }
        break
      }
      case 'bill': {
        const order = requireOrder(c.order)
        before = order.state
        order.state = 'bill'
        after = order.state
        break
      }
      case 'pay': {
        const order = requireOrder(c.order)
        const entries = Object.entries(c.lines)
        check(entries.length > 0, 'Выберите позиции для оплаты')
        const amount = entries.reduce((sum, [key, version]) => {
          const line = requireLine(order, key, version)
          check(line.status === 'served', 'К оплате доступны выданные позиции')
          return sum + line.quantity * line.price
        }, 0)
        const payments = Object.entries(c.payments)
        check(payments.every(([, value]) => Number.isSafeInteger(value) && value >= 0) && payments.reduce((sum, [, value]) => sum + value, 0) === amount, 'Сумма счёта изменилась')
        before = paid(order)
        order.payments ??= {}
        order.paidLines ??= {}
        for (const [key, value] of payments) order.payments[key] = (order.payments[key] ?? 0) + value
        for (const [key] of entries) order.paidLines[key] = order.lines[key].quantity * order.lines[key].price
        after = c.payments
        break
      }
      case 'close': {
        const order = requireOrder(c.order)
        check(c.cancel ? !paid(order) && linesOf(order).every(line => line.status === 'draft') :
          linesOf(order).every(line => line.status === 'served' && order.paidLines?.[line.id] !== undefined), 'Сначала завершите выдачу и расчёт либо отмените подтверждённые позиции')
        before = order.state
        after = c.cancel ? 'cancelled' : 'closed'
        state.archived[order.id] = { ...order, ended: at, state: c.cancel ? 'cancelled' : 'closed' }
        delete state.active[order.id]
        delete state.occupied[order.table]
        break
      }
      case 'message':
        break
    }
  } catch (caught) {
    if (!(caught instanceof Conflict)) throw caught
    error = caught.message
  }
  const next = error ? normalize(input) : state
  if (!optimistic) {
    next.revision++
    next.receipts[operation.id] = { result: error, at }
    if (!error) next.audit[operation.id] = {
      id: operation.id, operation: operation.id, actor, kind: c.type, at,
      before: JSON.stringify(before), after: JSON.stringify(after),
      ...(orderId ? { order: orderId } : {}), ...(item ? { item } : {})
    }
  }
  return { state: next, error }
}
