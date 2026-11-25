import { describe, expect, it } from 'vitest'
import { apply, type ConfigChange, type Operation, type Workspace } from '../src/domain'
import { getDirectory } from '../src/directory'
import { menu, seedWorkspace, tablesFor } from '../src/fixtures'

function change(state: Workspace, id: string, value: ConfigChange, version = 0) {
  const operation: Operation = { id, actor: 'ira', branch: 'center', at: 1, command: { type: 'configure', change: value, version } }
  return apply(state, operation, 1)
}
describe('Справочники администратора', () => {
  it('добавляет версию и аудит и отклоняет устаревшую запись', () => {
    const original = seedWorkspace(1, false)
    const dish = { ...menu[0], name: 'Эспрессо смены', price: 19550 }
    const changed = change(original, 'first', { kind: 'dish', entry: dish })
    expect(changed.error).toBe('')
    expect(changed.state.config?.dish?.[dish.id]?.configVersion).toBe(1)
    expect(changed.state.audit.first.kind).toBe('configure')
    expect(getDirectory('center', changed.state).catalog[0].price).toBe(19550)
    const stale = change(changed.state, 'stale', { kind: 'dish', entry: { ...dish, price: 100 } })
    expect(stale.error).toContain('коллегой')
    expect(stale.state.config?.dish?.[dish.id]?.price).toBe(19550)
    expect(change(changed.state, 'first', { kind: 'dish', entry: dish }).state).toBe(changed.state)
  })
  it('сохраняет размещение в границах и обновляет номер в рабочем зале', () => {
    const original = seedWorkspace(1, false)
    const table = tablesFor('center')[0]
    const invalid = change(original, 'invalid', { kind: 'table', entry: { ...table, x: 0 } })
    expect(invalid.error).toContain('в пределах')
    const edited = change(original, 'valid', { kind: 'table', entry: { ...table, number: 21, x: 27, seats: 6, round: false } })
    expect(getDirectory('center', edited.state).table(table.id)).toBe(21)
    expect(getDirectory('center', edited.state).layout.find(item => item.id === table.id)?.seats).toBe(6)
  })
  it('переименование категории работает через постоянный ключ блюда', () => {
    const original = seedWorkspace(1, false)
    const first = change(original, 'first', { kind: 'category', entry: { id: 'Кофе', name: 'Классика' } }).state
    expect(getDirectory('center', first).categoryId('Классика')).toBe('Кофе')
    const second = change(first, 'second', { kind: 'category', entry: { id: 'Кофе', name: 'Кофейная карта' } }, 1).state
    expect(getDirectory('center', second).catalog[0].category).toBe('Кофейная карта')
  })
})
