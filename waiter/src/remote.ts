import { initializeApp } from 'firebase/app'
import {
  connectDatabaseEmulator, endBefore, get, getDatabase, goOffline, goOnline, limitToLast,
  onChildAdded, onChildChanged, onChildRemoved, onDisconnect, onValue, orderByChild, query, ref,
  runTransaction, serverTimestamp, set, update, type Database
} from 'firebase/database'
import { apply, id, normalize, type Message, type Operation, type Workspace } from './domain'
import { seedWorkspace } from './fixtures'

const host = import.meta.env.VITE_WAITER_EMULATOR_HOST?.trim()
const address = (import.meta.env.DEV || import.meta.env.MODE === 'demo') ? /^([\w.-]+):(\d+)$/.exec(host ?? '') : null
export const remoteEnabled = Boolean(address)
export const backend = remoteEnabled ? 'emulator' : 'local'
const project = 'demo-coffeeman'
const namespace = 'demo-coffeeman-default-rtdb'
const root = 'coffeemanWaiter'
let database: Database | undefined
let listeners = 0
function db() {
  if (!address) throw new Error('Не настроен Firebase Emulator')
  if (!database) {
    const app = initializeApp({ projectId: project, databaseURL: `https://${namespace}.firebaseio.com` }, 'coffeeman-waiter')
    database = getDatabase(app)
    connectDatabaseEmulator(database, address[1], Number(address[2]))
  }
  return database
}
function watch(unsubscribe: () => void) {
  listeners++
  return () => { listeners--; unsubscribe() }
}
export const listenerCount = () => listeners
export function simulateNetwork(online: boolean) {
  if (database) online ? goOnline(database) : goOffline(database)
}
const workspaceRef = (branch: string) => ref(db(), `${root}/workspaces/${branch}`)
const chatRef = (branch: string, chat: string) => ref(db(), `${root}/messages/${branch}/${chat}`)

export function observeWorkspace(branch: string, changed: (state: Workspace) => void, failed: (error: Error) => void) {
  return watch(onValue(workspaceRef(branch), snap => {
    if (snap.exists()) changed(normalize(snap.val() as Workspace))
  }, failed))
}

export async function transactWorkspace(operation: Operation, seed = seedWorkspace(), databaseInstance = db()) {
  const path = ref(databaseInstance, `${root}/workspaces/${operation.branch}`)
  const result = await runTransaction(path, raw => {
    const current = raw ? normalize(raw as Workspace) : seed
    if (current.receipts[operation.id]) return current
    const next = apply(current, operation, operation.at)
    const audit = Object.fromEntries(Object.entries(next.state.audit).map(([key, event]) =>
      [key, event.operation === operation.id ? { ...event, at: serverTimestamp() } : event]))
    return { ...next.state, audit, receipts: { ...next.state.receipts, [operation.id]: { result: next.error, at: serverTimestamp() } } }
  }, { applyLocally: false })
  if (!result.committed) throw new Error('Транзакция не подтверждена')
  return normalize(result.snapshot.val() as Workspace)
}

export async function initializeWorkspace(branch: string, seed = seedWorkspace()) {
  const result = await runTransaction(workspaceRef(branch), value => value ?? seed, { applyLocally: false })
  return normalize(result.snapshot.val() as Workspace)
}

export async function deliverMessage(operation: Operation, databaseInstance = db()) {
  if (operation.command.type !== 'message') throw new Error('Ожидалась команда сообщения')
  const { chat, message } = operation.command
  const path = ref(databaseInstance, `${root}/messages/${operation.branch}/${chat}/${message.id}`)
  try {
    await update(path, { ...message, at: serverTimestamp() })
  } catch (error) {
    const existing = (await get(path)).val() as Message | null
    if (!existing || existing.id !== message.id || existing.actor !== message.actor || existing.text !== message.text) throw error
    return existing
  }
  return (await get(path)).val() as Message
}

export function observeChat(branch: string, chat: string, changed: (message: Message) => void, failed: (error: Error) => void) {
  const recent = query(chatRef(branch, chat), orderByChild('at'), limitToLast(35))
  const read = (snap: { val: () => unknown }) => changed(snap.val() as Message)
  const subscriptions = [watch(onChildAdded(recent, read, failed)), watch(onChildChanged(recent, read, failed))]
  return () => subscriptions.forEach(stop => stop())
}

export async function olderMessages(branch: string, chat: string, before: Message) {
  const snapshot = await get(query(chatRef(branch, chat), orderByChild('at'), endBefore(before.at, before.id), limitToLast(35)))
  const rows: Message[] = []
  snapshot.forEach(child => { rows.push(child.val() as Message) })
  return rows
}

export function observeConnection(branch: string, user: string, connected: (value: boolean) => void, online: (users: string[]) => void, failed: (error: Error) => void) {
  const presence = ref(db(), `${root}/presence/${branch}/${user}/${id()}`)
  let active = true
  const stopConnection = watch(onValue(ref(db(), '.info/connected'), async snap => {
    if (!active) return
    connected(snap.val() === true)
    if (!snap.val()) return
    try {
      await onDisconnect(presence).remove()
      if (active) await set(presence, { at: serverTimestamp() })
    } catch (error) { if (active) failed(error as Error) }
  }, failed))
  const directory = ref(db(), `${root}/presence/${branch}`)
  const current = new Set<string>()
  const add = (snap: { key: string | null }) => { if (snap.key) current.add(snap.key); online([...current]) }
  const stop = [watch(onChildAdded(directory, add, failed)), watch(onChildChanged(directory, add, failed)),
    watch(onChildRemoved(directory, snap => { if (snap.key) current.delete(snap.key); online([...current]) }, failed))]
  return () => {
    active = false
    stopConnection()
    stop.forEach(dispose => dispose())
    if (database) void set(presence, null).catch(failed)
  }
}
