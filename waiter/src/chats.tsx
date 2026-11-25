import { useEffect, useState } from 'react'
import { Check, Clock3, Link2, MessageCircle, Reply, Search, Send } from 'lucide-react'
import { id, type Link, type Message, type Workspace } from './domain'
import { direct, dish, firstName, menu, person, rooms, staff, tableNumber, tablesFor } from './fixtures'
import type { Dispatch } from './orders'
import { olderMessages, remoteEnabled } from './remote'
import { cacheMessage, useWork } from './storage'
import { Avatar, Button, Empty, ScreenTitle } from './ui'

export const chatRooms = (actor: string) => [...rooms, ...staff.filter(user => user.id !== actor).map(user => ({ id: direct(actor, user.id), name: user.name, actor: user.id }))]
const linkLabels = { table: 'Стол', order: 'Заказ', dish: 'Блюдо' }
export const linkTitle = (link: Link) => link.kind === 'dish' ? dish(link.key)?.name ?? link.key : link.kind === 'table' ? 'Стол ' + tableNumber(link.key) : 'Заказ ' + link.key.slice(0, 8)

export function Chats({ actor, branch, data, chat, select, loaded, read, dispatch, open }: {
  actor: string; branch: string; data: Workspace; chat: string; select: (key: string) => void
  loaded: Record<string, Message[]>; read: Record<string, number>; dispatch: Dispatch; open: (link: Link) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState<Message>()
  const [kind, setKind] = useState<Link['kind']>()
  const [key, setKey] = useState('')
  const [history, setHistory] = useState('')
  const queue = useWork(state => state.queue)
  const users = useWork(state => state.users)
  const messages = loaded[chat] ?? []
  const pending = queue.flatMap(operation => {
    const command = operation.command
    if (command.type !== 'message' || command.chat !== chat || messages.some(message => message.id === command.message.id)) return []
    return [{ ...command.message, pending: true }]
  })
  const rows: (Message & { pending?: boolean })[] = [...messages, ...pending].sort((a, b) => a.at - b.at)
  const matching = rows.filter(message => message.text.toLowerCase().includes(search.trim().toLowerCase()))
  const text = drafts[chat] ?? ''
  const directory = chatRooms(actor)
  useEffect(() => { setReply(undefined); setKind(undefined); setKey(''); setHistory(''); setSearch('') }, [chat])
  return <div className="stack">
    <ScreenTitle title="Чаты">Сообщения точки и личные переписки.</ScreenTitle>
    <div className="chat-grid">
      <aside className="panel pad">
        {directory.map(room => {
          const unread = (loaded[room.id] ?? []).filter(message => message.actor !== actor && message.at > (read[room.id] ?? 0)).length
          const user = 'actor' in room ? String(room.actor) : ''
          return <button key={room.id} className="line-row" aria-pressed={chat === room.id} onClick={() => select(room.id)}>
            <span className="row">{user ? <Avatar actor={user} small/> : <MessageCircle size={17}/>}<span><strong>{room.name}</strong>{user && <small>{users.includes(user) || (!remoteEnabled && user === actor) ? 'В сети' : 'Не в сети'}</small>}</span></span>
            {unread > 0 && <span className="counter">{unread}</span>}
          </button>
        })}
      </aside>
      <section className="panel pad stack">
        <h2>{directory.find(room => room.id === chat)?.name ?? 'Чат'}</h2>
        <label className="search"><Search size={16}/><input aria-label="Поиск сообщений" placeholder="Поиск по загруженным сообщениям" value={search} onChange={event => setSearch(event.target.value)}/></label>
        {remoteEnabled && messages.length > 0 && <Button onClick={() => {
          void olderMessages(branch, chat, messages[0]).then(async rows => {
            if (!rows.length) setHistory('Более ранних сообщений нет.')
            else await Promise.all(rows.map(message => cacheMessage(branch, chat, message)))
          }).catch(() => setHistory('Не удалось загрузить переписку.'))
        }}>Загрузить ранние сообщения</Button>}
        {history && <p className="muted" role="status">{history}</p>}
        <div className="messages" role="log" aria-label="Сообщения">
          {!matching.length && <Empty>{search ? 'Совпадений нет.' : 'Начните разговор.'}</Empty>}
          {matching.map(message => <article className={`message ${message.actor === actor ? 'own' : ''}`} key={message.id}>
            <div className="row spread"><strong>{message.actor === actor ? 'Вы' : firstName(message.actor)}</strong><small>{new Date(message.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} {message.actor === actor && (message.pending ? <Clock3 size={13} aria-label="Ожидает отправки"/> : <Check size={13} aria-label="Подтверждено"/>)}</small></div>
            {message.reply && <blockquote>{rows.find(row => row.id === message.reply)?.text ?? 'Ответ на раннее сообщение'}</blockquote>}
            <p>{message.text}</p>
            <div className="row wrap">{message.link && <button className="text-button" onClick={() => open(message.link!)}><Link2 size={15}/>{linkTitle(message.link)}</button>}
              <button className="text-button" onClick={() => setReply(message)}><Reply size={15}/> Ответить</button></div>
          </article>)}
        </div>
        <form className="stack" onSubmit={async event => {
          event.preventDefault()
          if (!text.trim()) return
          const message: Message = { id: id(), actor, at: Date.now(), text: text.trim(), ...(kind && key ? { link: { kind, key } } : {}), ...(reply ? { reply: reply.id } : {}) }
          if (await dispatch({ type: 'message', chat, message })) {
            setDrafts(current => ({ ...current, [chat]: '' })); setReply(undefined); setKind(undefined); setKey('')
          }
        }}>
          {reply && <div className="callout"><Reply size={16}/> {person(reply.actor).name} · {reply.text.slice(0, 65)} <button type="button" className="text-button" onClick={() => setReply(undefined)}>Убрать</button></div>}
          <label>Сообщение<textarea value={text} maxLength={1500} placeholder="Напишите сообщение" onChange={event => setDrafts(current => ({ ...current, [chat]: event.target.value }))}/></label>
          <div className="form-grid"><label>Связанный объект<select value={kind ?? ''} onChange={event => { setKind(event.target.value as Link['kind'] || undefined); setKey('') }}><option value="">Без вложения</option>{Object.entries(linkLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {kind && <label>{linkLabels[kind]}<select value={key} required onChange={event => setKey(event.target.value)}><option value="">Выберите объект</option>{(kind === 'table' ? tablesFor(branch).map(table => table.id) : kind === 'order' ? Object.keys(data.active) : menu.map(item => item.id)).map(value => <option key={value} value={value}>{linkTitle({ kind, key: value })}</option>)}</select></label>}
          </div>
          <Button primary type="submit" disabled={!text.trim()}><Send size={17}/> Отправить</Button>
        </form>
      </section>
    </div>
  </div>
}
