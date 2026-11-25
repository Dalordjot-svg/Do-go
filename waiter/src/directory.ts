import { createContext, useContext } from 'react'
import type { Config, Workspace } from './domain'
import { branches, categories, menu, staff, tablesFor } from './fixtures'

function combine<T extends { id: string }>(base: T[], entries?: Record<string, T>) {
  return Object.values({ ...Object.fromEntries(base.map(value => [value.id, value])), ...entries })
}
export function getRegistry(config?: Config) {
  return {
    staff: combine(staff, config?.staff),
    branches: combine(branches, config?.branch),
    certificates: Object.values(config?.certificate ?? {}),
    training: config?.training?.policy,
    preferences: config?.preferences?.app
  }
}
export function getDirectory(branch: string, data: Pick<Workspace, 'config'>, registry?: Workspace) {
  const people = getRegistry(registry?.config)
  const categoryOverrides = Object.values(data.config?.category ?? {})
  const displayName = (id: string) => categoryOverrides.find(category => category.id === id)?.name ?? id
  const catalog = combine(menu, data.config?.dish).map(item => ({
    ...item, category: displayName(item.category),
    modifiers: item.modifiers ?? []
  }))
  const layout = combine(tablesFor(branch), data.config?.table).sort((a, b) => a.number - b.number)
  return { ...people, catalog, layout,
    categories: [...new Set([...categories.map(displayName), ...catalog.map(item => item.category), ...categoryOverrides.map(item => item.name)])],
    categoryId: (name: string) => categoryOverrides.find(category => category.name === name)?.id ?? name,
    person: (id: string) => people.staff.find(person => person.id === id),
    table: (id: string) => layout.find(table => table.id === id)?.number ?? Number(id.replace(/^t/, ''))
  }
}
export const Directory = createContext(getDirectory('center', {}))
export const useDirectory = () => useContext(Directory)
