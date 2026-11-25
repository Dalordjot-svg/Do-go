import Dexie, { liveQuery, type Table } from 'dexie'
import { create } from 'zustand'
import { apply, id, isCritical, type Command, type Credential, type Message, type Operation, type Workspace } from './domain'
import { branches, menu, sampleMessages, seedWorkspace, staff, tablesFor } from './fixtures'
import * as remote from './remote'

export interface Queued extends Operation { stamp: number; attempts: number; retryAt: number; rejected?: string }
interface Snapshot { key: string; data: Workspace }
export interface CachedMessage extends Message { key: string; room: string }
interface Setting { key: string; value: unknown }
export class WaiterDB extends Dexie {
  snapshots!: Table<Snapshot, string>
  outbox!: Table<Queued, string>
  messages!: Table<CachedMessage, string>
  settings!: Table<Setting, string>
  constructor(name = 'coffeeman-waiter-v1') {
    super(name)
    this.version(1).stores({ snapshots: 'key', outbox: 'id, branch, stamp, retryAt', messages: 'key, room, [room+at]', settings: 'key' })
  }
}
export const local = new WaiterDB()
export const registryBranch = 'registry'
const scope = (branch: string) => `${remote.backend}:${branch}`
export const roomKey = (branch: string, chat: string) => `${scope(branch)}:${chat}`
export async function setting<T>(key: string, fallback: T) {
  return (await local.settings.get(key))?.value as T ?? fallback
}
export async function save(key: string, value: unknown) { await local.settings.put({ key, value }) }
export async function cacheMessage(branch: string, chat: string, message: Message) {
  const room = roomKey(branch, chat)
  await local.transaction('rw', local.messages, async () => {
    await local.messages.put({ ...message, room, key: `${room}:${message.id}` })
    const rows = await local.messages.where('[room+at]').between([room, Dexie.minKey], [room, Dexie.maxKey], true, true).primaryKeys()
    if (rows.length > 350) await local.messages.bulkDelete(rows.slice(0, rows.length - 350))
  })
}

type SyncState = {
  workspace: Workspace; queue: Queued[]; online: boolean; users: string[]; busy: boolean; error: string; slow: boolean
}
export const useWork = create<SyncState>(() => ({ workspace: seedWorkspace(Date.now(), false), queue: [], online: false, users: [], busy: false, error: '', slow: false }))
const report = (error: unknown) => useWork.setState({ error: error instanceof Error ? error.message : String(error) })
let kicked: (() => void) | undefined
let sequence = 0

export async function enqueue(branch: string, actor: string, command: Command) {
  const now = Date.now()
  sequence = Math.max(sequence + 1, now * 1000)
  const operation: Queued = { id: id(), actor, branch: scope(branch), command, at: now, stamp: sequence, attempts: 0, retryAt: 0 }
  await local.outbox.add(operation)
  kicked?.()
  return operation.id
}

export async function enqueueCertificate(actor: string, certificate: Omit<Credential, 'actor'>) {
  const entry = { ...certificate, actor, id: `${actor}-${certificate.token}` }
  const key = scope(registryBranch)
  const operationId = 'certificate-' + entry.id
  await local.transaction('rw', local.snapshots, local.outbox, async () => {
    if ((await local.snapshots.get(key))?.data.config?.certificate?.[entry.id] || await local.outbox.get(operationId)) return
    const at = Date.now()
    sequence = Math.max(sequence + 1, at * 1000)
    await local.outbox.add({ id: operationId, actor, branch: key, at, stamp: sequence, attempts: 0, retryAt: 0,
      command: { type: 'configure', change: { kind: 'certificate', entry }, version: 0 } })
  })
  kicked?.()
}

async function cacheSnapshot(key: string, state: Workspace) {
  await local.transaction('rw', local.snapshots, async () => {
    const old = await local.snapshots.get(key)
    if (!old || old.data.revision <= state.revision) await local.snapshots.put({ key, data: state })
  })
}
export async function resetLocal() {
  await local.transaction('rw', local.snapshots, local.outbox, local.messages, local.settings, async () => {
    await Promise.all([local.snapshots.clear(), local.outbox.clear(), local.messages.clear(), local.settings.clear()])
  })
}

export function runWork(branch: string, actor: string) {
  const key = scope(branch)
  const registryKey = scope(registryBranch)
  const example = branches.some(item => item.id === branch)
  let active = true
  let busy = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let seeded = !remote.remoteEnabled
  useWork.setState({ workspace: seedWorkspace(Date.now(), false), queue: [], online: remote.remoteEnabled ? false : navigator.onLine, users: [], error: '', busy: false })
  const safeReport = (error: unknown) => { if (active) report(error) }
  const storeRemote = (data: Workspace) => { if (active) void cacheSnapshot(key, data).catch(safeReport) }
  const disposables: (() => void)[] = []
  void local.transaction('rw', local.snapshots, local.settings, async () => {
    if (!await local.snapshots.get(key)) await local.snapshots.put({ key, data: seedWorkspace(Date.now(), !remote.remoteEnabled && example) })
    await local.settings.bulkPut([{ key: 'catalog', value: menu }, { key: 'staff', value: staff }, { key: 'branches', value: branches }, { key: `layout:${branch}`, value: tablesFor(branch) }])
  }).then(() => schedule()).catch(safeReport)
  const subscription = liveQuery(async () => ({
    snapshot: await local.snapshots.get(key),
    queue: (await local.outbox.where('branch').anyOf(key, registryKey).toArray()).sort((a, b) => a.stamp - b.stamp)
  })).subscribe({
    next({ snapshot, queue }) {
      if (!active || !snapshot) return
      let workspace = snapshot.data
      for (const command of queue) {
        if (command.branch === key && !command.rejected && !isCritical(command.command)) workspace = apply(workspace, command, command.at, true).state
      }
      useWork.setState({ workspace, queue })
    },
    error: safeReport
  })

  async function tick() {
    if (!active || busy || !useWork.getState().online) return
    busy = true
    try {
      if (!seeded) {
        const data = await remote.initializeWorkspace(branch, seedWorkspace(Date.now(), example))
        if (!active) return
        await cacheSnapshot(key, data)
        seeded = true
      }
      const rows = (await local.outbox.where('branch').anyOf(key, registryKey).filter(row => !row.rejected).toArray()).sort((a, b) => a.stamp - b.stamp)
      const deferred = new Set<string>()
      for (const row of rows) {
        if (!active || !useWork.getState().online) break
        if (row.retryAt > Date.now()) deferred.add(row.branch)
        if (deferred.has(row.branch)) continue
        useWork.setState({ busy: true })
        try {
          if (useWork.getState().slow) await new Promise(resolve => setTimeout(resolve, 850))
          if (!active) break
          const scopeKey = row.branch
          const target = scopeKey === registryKey ? registryBranch : branch
          const operation = { ...row, branch: target, at: Date.now() }
          if (row.command.type === 'message') {
            const message = remote.remoteEnabled ? await remote.deliverMessage(operation) : row.command.message
            await cacheMessage(branch, row.command.chat, message)
            await local.outbox.delete(row.id)
          } else if (remote.remoteEnabled) {
            const state = await remote.transactWorkspace(operation, seedWorkspace(Date.now(), target !== registryBranch && example))
            await local.transaction('rw', local.snapshots, local.outbox, async () => {
              const cached = await local.snapshots.get(scopeKey)
              if (!cached || cached.data.revision <= state.revision) await local.snapshots.put({ key: scopeKey, data: state })
              const rejected = state.receipts[row.id].result
              if (rejected) await local.outbox.update(row.id, { rejected })
              else await local.outbox.delete(row.id)
            })
          } else {
            await local.transaction('rw', local.snapshots, local.outbox, async () => {
              const snapshot = await local.snapshots.get(scopeKey)
              const result = apply(snapshot?.data ?? seedWorkspace(Date.now(), target !== registryBranch && example), operation, operation.at)
              await local.snapshots.put({ key: scopeKey, data: result.state })
              if (result.error) await local.outbox.update(row.id, { rejected: result.error })
              else await local.outbox.delete(row.id)
            })
          }
          if (active) useWork.setState({ error: '' })
        } catch (error) {
          safeReport(error)
          await local.outbox.update(row.id, { attempts: row.attempts + 1, retryAt: Date.now() + Math.min(30000, 500 * 2 ** row.attempts) })
          deferred.add(row.branch)
        }
      }
    } catch (error) { safeReport(error) }
    finally {
      busy = false
      if (active) {
        useWork.setState({ busy: false })
        schedule(1000)
      }
    }
  }
  function schedule(delay = 0) {
    if (!active) return
    clearTimeout(timer)
    timer = setTimeout(() => { void tick() }, delay)
  }
  kicked = schedule
  if (remote.remoteEnabled) {
    disposables.push(remote.observeWorkspace(branch, storeRemote, safeReport))
    disposables.push(remote.observeConnection(branch, actor, online => {
      useWork.setState({ online })
      if (online) schedule()
    }, users => useWork.setState({ users }), safeReport))
  } else {
    const status = () => { useWork.setState({ online: navigator.onLine }); schedule() }
    addEventListener('online', status)
    addEventListener('offline', status)
    disposables.push(() => { removeEventListener('online', status); removeEventListener('offline', status) })
  }
  return () => {
    active = false
    if (kicked === schedule) kicked = undefined
    clearTimeout(timer)
    subscription.unsubscribe()
    disposables.forEach(dispose => dispose())
  }
}

export function watchRoom(branch: string, chat: string, changed: (messages: Message[]) => void) {
  const key = roomKey(branch, chat)
  const initial = remote.remoteEnabled ? [] : sampleMessages(chat)
  const subscription = liveQuery(() => local.messages.where('room').equals(key).toArray()).subscribe({
    next: rows => changed([...initial, ...rows].sort((a, b) => a.at - b.at)),
    error: report
  })
  const stop = remote.remoteEnabled ? remote.observeChat(branch, chat, message => { void cacheMessage(branch, chat, message).catch(report) }, report) : undefined
  return () => { subscription.unsubscribe(); stop?.() }
}

export function watchRegistry(changed: (state: Workspace | undefined) => void) {
  const key = scope(registryBranch)
  const subscription = liveQuery(() => local.snapshots.get(key)).subscribe({
    next: value => changed(value?.data), error: report
  })
  const stop = remote.remoteEnabled ? remote.observeWorkspace(registryBranch, state => {
    void cacheSnapshot(key, state).catch(report)
  }, report) : undefined
  return () => { subscription.unsubscribe(); stop?.() }
}
