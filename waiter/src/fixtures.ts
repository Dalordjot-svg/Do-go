import type { Dish, Line, Message, Order, Seat, Staff, Table, Workspace } from './domain'
import { courses, id, shared } from './domain'

export const staff: Staff[] = [
  { id: 'mila', name: 'Мила Соколова', initials: 'МС', role: 'Официант', color: 'lavender' },
  { id: 'artem', name: 'Артём Волков', initials: 'АВ', role: 'Официант', color: 'blue' },
  { id: 'lena', name: 'Лена Мирная', initials: 'ЛМ', role: 'Старший официант', color: 'rose' },
  { id: 'tim', name: 'Тим Березин', initials: 'ТБ', role: 'Бариста', color: 'sage' },
  { id: 'ira', name: 'Ира Ветрова', initials: 'ИВ', role: 'Администратор', color: 'sand' }
]
export const branches = [{ id: 'center', name: 'Кофейня «Центр»' }, { id: 'park', name: 'Кофейня «Парк»' }]
export const person = (key: string) => staff.find(value => value.id === key) ?? { id: key, name: 'Сотрудник', initials: 'С', role: 'Официант', color: 'sage' }
export const firstName = (key: string) => person(key).name.split(' ')[0]
export const categories = ['Кофе', 'Авторские напитки', 'Чай', 'Холодные напитки', 'Завтраки', 'Основные блюда', 'Салаты', 'Десерты', 'Дополнительно']
const menuGroups: [string[], string, string, number, number][] = [
  [['Эспрессо', 'Американо', 'Капучино', 'Латте', 'Флэт уайт', 'Фильтр-кофе'], 'Кофейное зерно средней обжарки', 'Молоко в напитках с молоком', 170, 4],
  [['Лавандовый раф', 'Карамельный мокко', 'Матча латте', 'Апельсиновый раф', 'Какао с маршмеллоу'], 'Напиток по рецепту кофейни', 'Молоко', 310, 6],
  [['Эрл Грей', 'Сенча', 'Облепиховый чай', 'Травяной сбор', 'Молочный улун'], 'Подаётся в чайнике', '', 220, 6],
  [['Айс латте', 'Эспрессо-тоник', 'Малиновый лимонад', 'Холодный чай с персиком', 'Бамбл'], 'Освежающий напиток со льдом', '', 250, 5],
  [['Сырники', 'Омлет с зеленью', 'Овсяная каша', 'Тост с авокадо', 'Круассан с ветчиной'], 'Завтрак весь день', 'Глютен, яйца, молоко', 350, 12],
  [['Паста с томатами', 'Курица с овощами', 'Тыквенный суп', 'Сэндвич с индейкой', 'Паста с грибами'], 'Горячее блюдо', 'Уточнить состав на кухне', 450, 16],
  [['Цезарь с курицей', 'Салат с грушей', 'Зелёный салат', 'Боул с киноа'], 'Свежие овощи и заправка', 'Уточнить состав на кухне', 340, 10],
  [['Чизкейк', 'Морковный торт', 'Брауни', 'Медовик', 'Лимонный тарт'], 'Десерт из витрины', 'Глютен, яйца, молоко', 290, 4],
  [['Овсяное молоко', 'Ванильный сироп', 'Дополнительный эспрессо', 'Соус', 'Ломтик лимона'], 'Дополнение к заказу', 'Уточнить состав', 50, 2]
]
export const menu: Dish[] = menuGroups.flatMap(([names, description, allergens, price, prep], group) =>
  names.map((name, index) => ({
    id: `d${group}-${index}`, name, category: categories[group], price: (price + index * 20) * 100,
    description, allergens, prep, wait: 3, popular: index === 0 || name === 'Капучино',
    modifiers: group < 4 ? ['Овсяное молоко', 'Без сахара', 'Ванильный сироп', 'Большой объём', 'Тёплый', 'Без льда'] : ['Соус отдельно', 'Без зелени', 'Дополнительный сыр']
  })))
export const dish = (key: string) => menu.find(value => value.id === key)
const central: [number, number, number, number, number, boolean, string][] = [
  [14, 23, 11, 17, 2, true, 'У окна'], [35, 23, 12, 16, 4, false, 'У окна'], [56, 23, 12, 16, 4, false, 'У окна'],
  [78, 23, 11, 17, 2, true, 'У окна'], [14, 52, 11, 17, 2, true, 'Основной зал'], [35, 52, 14, 16, 4, false, 'Основной зал'],
  [56, 52, 14, 16, 4, false, 'Основной зал'], [78, 52, 11, 17, 2, true, 'Основной зал'],
  [13, 79, 11, 15, 2, false, 'Основной зал'], [32, 79, 11, 15, 2, false, 'Основной зал'],
  [51, 79, 11, 15, 2, true, 'Основной зал'], [70, 79, 12, 15, 4, false, 'Основной зал']
]
export const tablesFor = (branch: string): Table[] => central.map(([x, y, w, h, seats, round, zone], index) => ({
  id: `t${index + 1}`, number: index + 1, x: branch === 'park' ? 92 - x : x,
  y: branch === 'park' && index < 8 ? y + 3 : y, w, h, seats, round: branch === 'park' ? !round : round, zone
}))
export const tableNumber = (key: string) => key.replace(/^t/, '')
export const makeGuests = (count: number, prefix: string = id()) => Object.fromEntries(Array.from({ length: count }, (_, i) => {
  const seat: Seat = { id: `${prefix}-${i + 1}`, name: `Гость ${i + 1}` }
  return [seat.id, seat]
}))
export const makeLine = (item: Dish, actor: string, guest = shared): Line => ({
  id: id(), item: item.id, name: item.name, price: item.price, quantity: 1, guest, modifiers: '', note: '', course: courses[0],
  status: 'draft', createdAt: Date.now(), changedAt: Date.now(), actor, version: 0, prep: item.prep, wait: item.wait
})
export function seedWorkspace(now = Date.now(), examples = true): Workspace {
  const base: Workspace = { revision: 0, active: {}, archived: {}, occupied: {}, stock: {}, audit: {}, receipts: {} }
  if (!examples) return base
  base.stock = {
    'd7-0': { count: 3, reason: 'Последние порции в витрине', version: 1, generation: 'seed' },
    'd7-1': { count: 0, reason: 'Закончился', version: 1, generation: 'seed' },
    'd4-0': { count: 5, reason: 'До новой поставки', version: 1, generation: 'seed' }
  }
  const examplesList = [
    [2, 'mila', 3, 12, 'cooking', 2, 'd0-2'],
    [3, 'artem', 4, 7, 'accepted', 2, 'd5-0'],
    [5, 'mila', 2, 18, 'ready', 2, 'd0-2'],
    [7, 'lena', 3, 26, 'cooking', 18, 'd6-0'],
    [10, 'artem', 2, 31, 'served', 2, 'd4-0'],
    [12, 'mila', 2, 65, 'served', 2, 'd7-2']
  ] as const
  for (const [n, owner, guests, elapsed, status, changed, key] of examplesList) {
    const orderId = `demo-${n}`
    const line = { ...makeLine(dish(key)!, owner), id: `line-${n}`, status, createdAt: now - elapsed * 60000, changedAt: now - changed * 60000 }
    const order: Order = { id: orderId, table: `t${n}`, owner, opened: line.createdAt, guests: makeGuests(guests, orderId),
      lines: { [line.id]: line }, note: '', state: n === 12 ? 'closed' : n === 10 ? 'bill' : 'active' }
    if (n === 12) base.archived[orderId] = { ...order, ended: now - 1200000, payments: { shared: line.price }, paidLines: { [line.id]: line.price } }
    else {
      base.active[orderId] = order
      base.occupied[order.table] = order.id
    }
  }
  return base
}
export const rooms = [{ id: 'general', name: 'Общий чат' }, { id: 'kitchen', name: 'Кухня' }, { id: 'bar', name: 'Бар' }, { id: 'admin', name: 'Администрация' }]
export const direct = (a: string, b: string) => ['dm', ...[a, b].sort()].join('-')
export function sampleMessages(chat: string): Message[] {
  const at = Date.now() - 600000
  if (chat === 'general') return [{ id: 'sample-1', actor: 'ira', text: 'Хорошей смены! Сегодня в витрине свежий лимонный тарт.', at }, { id: 'sample-2', actor: 'lena', text: 'Принято, спасибо!', at: at + 30000, reply: 'sample-1' }]
  if (chat === 'bar') return [{ id: 'sample-3', actor: 'tim', text: 'Капучино для пятого стола можно забирать.', link: { kind: 'table', key: 't5' }, at }]
  if (chat === 'kitchen') return [{ id: 'sample-4', actor: 'lena', text: 'Уточните, пожалуйста, состав заправки для цезаря.', link: { kind: 'dish', key: 'd6-0' }, at }]
  return []
}
