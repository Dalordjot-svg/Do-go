import { afterAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectDatabaseEmulator, getDatabase, limitToLast, onValue, query, ref, type Database } from 'firebase/database'
import { deliverMessage, transactWorkspace } from '../src/remote'
import { id, type Command, type Operation } from '../src/domain'
import { dish, makeGuests, makeLine, seedWorkspace } from '../src/fixtures'

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST
const project = 'demo-coffeeman'
const prefix = 'coffeemanWaiter'
const create = (name: string) => {
  const app = initializeApp({ projectId: project, databaseURL: 'https://demo-coffeeman-default-rtdb.firebaseio.com' }, name)
  const db = getDatabase(app)
  const [hostname, port] = host!.split(':')
  connectDatabaseEmulator(db, hostname, Number(port))
  return { app, db }
}
const at = Date.now()
const seed = seedWorkspace(at, false)
const op = (branch: string, command: Command, actor = 'mila'): Operation => ({ id: id(), actor, branch, at, command })
const open = (branch: string, table: string, order: string, actor = 'mila') => op(branch, { type: 'open', table, order, guests: makeGuests(2, order) }, actor)

describe.skipIf(!host)('Два клиента Firebase Emulator', () => {
  const clients: ReturnType<typeof create>[] = []
  function dbs() {
    const a = create(id()), b = create(id())
    clients.push(a, b)
    return [a.db, b.db] as const
  }
  const use = (operation: Operation, db: Database) => transactWorkspace(operation, seed, db)
  afterAll(async () => { await Promise.all(clients.map(client => deleteApp(client.app))) })
  it('принимает только одно открытие стола', async () => {
    const [a, b] = dbs(), branch = id()
    const x = open(branch, 't1', 'aa'), y = open(branch, 't1', 'bb', 'artem')
    const results = await Promise.all([use(x, a), use(y, b)])
    expect(results.map((data, index) => data.receipts[[x.id, y.id][index]].result).filter(Boolean)).toEqual(['Стол уже занят'])
  })
  it('списывает последнюю порцию один раз', async () => {
    const [a, b] = dbs(), branch = id()
    await use(open(branch, 't1', 'aa'), a)
    await use(open(branch, 't2', 'bb', 'artem'), b)
    const item = dish('d7-0')!
    const lineA = makeLine(item, 'mila'), lineB = makeLine(item, 'artem')
    await use(op(branch, { type: 'stock', item: item.id, count: 1, reason: '', version: 0 }), a)
    await Promise.all([use(op(branch, { type: 'add', order: 'aa', line: lineA }), a), use(op(branch, { type: 'add', order: 'bb', line: lineB }, 'artem'), b)])
    const ops = [op(branch, { type: 'send', order: 'aa', lines: { [lineA.id]: 0 } }), op(branch, { type: 'send', order: 'bb', lines: { [lineB.id]: 0 } }, 'artem')]
    const results = await Promise.all([use(ops[0], a), use(ops[1], b)])
    const winning = results.findIndex((result, index) => !result.receipts[ops[index].id].result)
    expect(winning).toBeGreaterThanOrEqual(0)
    expect(results[1 - winning].receipts[ops[1 - winning].id].result).toContain('Недостаточно')
    const repeated = await use(ops[winning], b)
    expect(repeated.stock[item.id].count).toBe(0)
    expect(typeof repeated.audit[ops[winning].id].at).toBe('number')
  })
  it('разрешает независимые изменения и отклоняет конфликт одной позиции', async () => {
    const [a, b] = dbs(), branch = id()
    await use(open(branch, 't1', 'o'), a)
    const lines = ['mila', 'artem'].map(actor => makeLine(dish('d0-2')!, actor))
    await Promise.all(lines.map((line, index) => use(op(branch, { type: 'add', order: 'o', line }, line.actor), [a, b][index])))
    const edit = (index: number, note: string, version = 0) => op(branch, { type: 'edit', order: 'o', line: lines[index].id, patch: { note }, version })
    await Promise.all([use(edit(0, 'A'), a), use(edit(1, 'B'), b)])
    const one = edit(0, 'C', 1), two = edit(0, 'D', 1)
    const results = await Promise.all([use(one, a), use(two, b)])
    expect(results.find(data => data.receipts[one.id] && data.receipts[two.id])?.active.o.lines[lines[1].id].note).toBe('B')
    expect(results.map((data, index) => data.receipts[[one.id, two.id][index]].result).filter(Boolean)).toHaveLength(1)
  })
  it('доставляет одно сообщение второму клиенту при повторе', async () => {
    const [a, b] = dbs(), branch = id()
    const message = { id: id(), actor: 'mila', text: 'На кухню', at }
    const send = op(branch, { type: 'message', chat: 'general', message })
    let dispose = () => {}
    const delivered = new Promise(resolve => {
      dispose = onValue(query(ref(b, `${prefix}/messages/${branch}/general`), limitToLast(5)), snap => {
        if (snap.exists()) resolve(snap.size)
      })
    })
    await deliverMessage(send, a)
    await deliverMessage(send, a)
    expect(await delivered).toBe(1)
    dispose()
  })
})
