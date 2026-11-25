import { describe, expect, it } from 'vitest'
import { apply, issue, money, shared, splitBill, type Command, type Operation, type Workspace } from '../src/domain'
import { dish, makeGuests, makeLine, seedWorkspace } from '../src/fixtures'
const now = 1_800_000_000_000
const act = (id: string, command: Command, actor = 'mila'): Operation => ({ id, command, actor, at: now, branch: 'center' })
const open = (table: string, order: string) => act(order, { type: 'open', table, order, guests: makeGuests(2, order) })
const next = (state: Workspace, ...commands: Operation[]) => commands.reduce((data, op) => apply(data, op, now).state, state)
describe('Состояние смены', () => {
  it('открывает стол ровно один раз, повтор сохраняет квитанцию', () => {
    const seed = seedWorkspace(now, false)
    const command = open('t1', 'o1')
    const data = next(seed, command)
    expect(apply(data, command, now).state).toBe(data)
    const other = apply(data, open('t1', 'o2'), now)
    expect(other.error).toContain('занят')
    expect(Object.keys(other.state.active)).toEqual(['o1'])
  })
  it('атомарно списывает последнюю порцию и сохраняет идемпотентность', () => {
    const a = { ...makeLine(dish('d7-0')!, 'mila'), id: 'a' }
    const b = { ...a, id: 'b' }
    const seed = next(seedWorkspace(now, false), open('t1', 'o1'), open('t2', 'o2'),
      act('stock', { type: 'stock', item: a.item, count: 1, reason: '', version: 0 }),
      act('add-a', { type: 'add', order: 'o1', line: a }), act('add-b', { type: 'add', order: 'o2', line: b }))
    const send = act('send-a', { type: 'send', order: 'o1', lines: { a: 0 } })
    const data = next(seed, send, send, act('send-b', { type: 'send', order: 'o2', lines: { b: 0 } }))
    expect(data.stock[a.item].count).toBe(0)
    expect(data.active.o1.lines.a.status).toBe('accepted')
    expect(data.active.o2.lines.b.status).toBe('draft')
    expect(data.receipts['send-b'].result).toContain('Недостаточно')
    const cancel = act('cancel', { type: 'void', order: 'o1', line: 'a', version: 1, reason: 'Порция не приготовлена', restock: true })
    expect(next(data, cancel, cancel).stock[a.item].count).toBe(1)
  })
  it('не списывает ни одну позицию при нехватке нескольких блюд', () => {
    const a = { ...makeLine(dish('d0-0')!, 'mila'), id: 'a' }
    const b = { ...makeLine(dish('d7-0')!, 'mila'), id: 'b', quantity: 2 }
    const s = next(seedWorkspace(now, false), open('t1', 'o1'),
      act('la', { type: 'stock', item: a.item, count: 1, reason: '', version: 0 }),
      act('lb', { type: 'stock', item: b.item, count: 1, reason: '', version: 0 }),
      act('aa', { type: 'add', order: 'o1', line: a }), act('ab', { type: 'add', order: 'o1', line: b }))
    const result = apply(s, act('send', { type: 'send', order: 'o1', lines: { a: 0, b: 0 } }), now)
    expect(result.error).toContain('Недостаточно')
    expect(result.state.stock[a.item].count).toBe(1)
    expect(result.state.active.o1.lines.a.status).toBe('draft')
  })
  it('объединяет правки разных строк, возвращает конфликт одной строки', () => {
    const a = { ...makeLine(dish('d0-2')!, 'mila'), id: 'a' }
    const b = { ...a, id: 'b' }
    const seed = next(seedWorkspace(now, false), open('t1', 'o1'), act('aa', { type: 'add', order: 'o1', line: a }), act('ab', { type: 'add', order: 'o1', line: b }))
    const edit = (key: string, line: string) => act(key, { type: 'edit', order: 'o1', line, version: 0, patch: { note: key } })
    const result = next(seed, edit('ea', 'a'), edit('eb', 'b'), edit('ec', 'a'))
    expect(result.active.o1.lines.a.note).toBe('ea')
    expect(result.active.o1.lines.b.note).toBe('eb')
    expect(result.receipts.ec.result).toContain('изменилась')
  })
  it('различает задержки, выдачу, тестовую оплату и архив', () => {
    const line = { ...makeLine(dish('d0-2')!, 'mila'), id: 'line', price: 20001, guest: shared }
    const data = next(seedWorkspace(now, false), open('t1', 'o1'), act('add', { type: 'add', order: 'o1', line }),
      act('send', { type: 'send', order: 'o1', lines: { line: 0 } }))
    expect(issue(data.active.o1.lines.line, now + 60000 * 10)).toBe('Задержка приготовления')
    const ready = next(data, act('ready', { type: 'status', order: 'o1', lines: { line: 1 }, status: 'ready' }))
    expect(issue(ready.active.o1.lines.line, now + 60000 * 4)).toBe('Ожидает выдачи')
    expect(issue(ready.active.o1.lines.line, now + 60000 * 10)).toBe('Нет отметки о выдаче')
    const shares = splitBill(ready.active.o1)
    expect(shares).toEqual({ 'o1-1': 10001, 'o1-2': 10000 })
    expect(money(20001)).toContain('200,01')
    const archived = next(ready, act('served', { type: 'status', order: 'o1', lines: { line: 2 }, status: 'served' }),
      act('paid', { type: 'pay', order: 'o1', lines: { line: 3 }, payments: shares }), act('close', { type: 'close', order: 'o1' }))
    expect(archived.archived.o1.state).toBe('closed')
    expect(archived.occupied.t1).toBeUndefined()
  })
  it('сохраняет передачу и перенос в журнале', () => {
    const result = next(seedWorkspace(now, false), open('t1', 'o1'), act('transfer', { type: 'transfer', orders: { o1: 'mila' }, owner: 'lena' }),
      act('move', { type: 'move', order: 'o1', from: 't1', table: 't2' }))
    expect(result.active.o1.owner).toBe('lena')
    expect(result.audit.transfer.after).toBe('"lena"')
    expect(result.occupied).toEqual({ t2: 'o1' })
  })
})
