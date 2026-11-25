import { useRef, useState } from 'react'
import { ArrowRight, Award, BookOpen, Check, Coffee, Printer, WifiOff } from 'lucide-react'
import { apply, guestCount, id, linesOf, shared, type Command, type Workspace } from './domain'
import { branches, dish, makeGuests, makeLine, person, seedWorkspace, staff } from './fixtures'
import { Hall } from './hall'
import { Catalog, OpenTable, OrderEditor, type Dispatch, versions } from './orders'
import { asset, Avatar, Brand, Button, Empty } from './ui'

const version = '1.0'
export interface CertificateData { token: string; at: number; score: number; version: string }
export interface AcademyState {
  stage: 'welcome' | 'profile' | 'branch' | 'sasha' | 'lesson' | 'exam' | 'certificate' | 'work'
  actor: string; branch: string; step: number; sandbox?: Workspace; blocked?: boolean; certificate?: CertificateData
}
export const initialAcademy: AcademyState = { stage: 'welcome', actor: '', branch: 'center', step: 0 }
export const greeting = 'Привет! Меня зовут Саша. Сейчас я научу тебя пользоваться нашим приложением, покажу его возможности и поделюсь полезными лайфхаками, которые помогут тебе работать быстрее и удобнее'
const curriculum = [
  ['Знакомство с интерфейсом', 'Откройте сводку смены. В ней видны свободные столы и задачи на выдачу.'],
  ['Навигация', 'Переключитесь с «Зала» на «Заказы».'],
  ['Карта зала', 'Переключитесь на список и найдите стол 1.'],
  ['Открытие стола', 'Откройте первый стол для двух гостей.'],
  ['Добавление гостей', 'Добавьте третьего гостя.'],
  ['Создание заказа', 'Добавьте капучино к заказу.'],
  ['Разделение по персонам', 'Перенесите напиток первому гостю.'],
  ['Комментарии и модификаторы', 'Добавьте овсяное молоко и пожелание гостя.'],
  ['Быстрый поиск', 'Найдите чизкейк по части названия и выберите его.'],
  ['Популярное и избранное', 'Отметьте капучино звездой и откройте «Избранное».'],
  ['Стоп-лист', 'Отметьте чизкейк как недоступный.'],
  ['Ограниченные остатки', 'Верните одну порцию чизкейка.'],
  ['Контроль приготовления', 'Подтвердите капучино и отметьте готовность.'],
  ['Выдача блюд', 'Отметьте капучино выданным гостю.'],
  ['Совместное редактирование', 'Сохраните комментарий от имени коллеги.'],
  ['Передача столов', 'Передайте первый стол Артёму.'],
  ['Рабочий мессенджер', 'Напишите учебное сообщение на кухню.'],
  ['Автономный режим', 'Отключите сеть в песочнице и сохраните учебный черновик.'],
  ['Синхронизация данных', 'Восстановите сеть песочницы и подтвердите синхронизацию черновика.']
] as const
export const lessonNames = curriculum.map(item => item[0])
const sandbox = () => {
  const data = seedWorkspace(Date.now(), false)
  data.stock['d7-1'] = { count: 0, reason: 'Учебный стоп-лист', version: 1, generation: 'training' }
  return data
}

export function Certificate({ actor, certificate }: { actor: string; certificate: CertificateData }) {
  return <section className="certificate panel stack">
    <Award size={34} style={{ marginInline: 'auto' }}/>
    <h2>COFFEEMAN Academy</h2><h1>Сертификат</h1><strong>{person(actor).name}</strong>
    <p>Практический экзамен · {certificate.score}%</p>
    <p className="muted">{new Date(certificate.at).toLocaleDateString('ru-RU')} · программа {certificate.version}</p>
    <small>{certificate.token}</small>
    <small>Внутренний демонстрационный документ</small>
    <div><Button onClick={() => window.print()}><Printer size={17}/> Печать / PDF</Button></div>
  </section>
}

function examErrors(data: Workspace, blocked: boolean) {
  const order = data.archived[Object.keys(data.archived)[0]] ?? data.active[Object.keys(data.active)[0]]
  const lines = order ? linesOf(order) : []
  return [
    [order && guestCount(order) >= 2, 'Откройте виртуальный стол минимум для двух гостей.'],
    [new Set(lines.map(line => line.guest).filter(key => key !== shared)).size >= 2, 'Добавьте блюда двум разным гостям.'],
    [lines.some(line => line.guest === shared), 'Добавьте позицию на общий стол.'],
    [lines.some(line => line.modifiers), 'Сохраните модификатор в позиции.'],
    [lines.some(line => line.note) || order?.note, 'Сохраните комментарий.'],
    [blocked, 'Обработайте позицию из стоп-листа.'],
    [lines.length > 0 && lines.every(line => line.status === 'served'), 'Отметьте выдачу всех блюд.'],
    [order?.state === 'closed', 'Проведите тестовый расчёт и завершите заказ.']
  ].filter(([pass]) => !pass).map(([, error]) => String(error))
}

export function Academy({ state, change }: { state: AcademyState; change: (next: AcademyState) => void }) {
  const [feedback, setFeedback] = useState<string[]>([])
  const [mini, setMini] = useState('')
  const [favorites, setFavorites] = useState<string[]>([])
  const [map, setMap] = useState<'map' | 'list'>('map')
  const [input, setInput] = useState('')
  const [modifier, setModifier] = useState(false)
  const [online, setOnline] = useState(true)
  const [preview, setPreview] = useState('t1')
  const ref = useRef(state)
  ref.current = state
  const update = (patch: Partial<AcademyState>) => {
    const next = { ...ref.current, ...patch }
    ref.current = next
    change(next)
  }
  const data = state.sandbox ?? sandbox()
  const order = Object.values(data.active)[0] ?? Object.values(data.archived)[0]
  const line = order && linesOf(order)[0]
  const actor = state.actor || 'mila'
  const stock = data.stock['d7-0']
  const dispatch = (async (command: Command) => {
    const at = Date.now()
    const result = apply(ref.current.sandbox ?? sandbox(), { id: id(), actor: state.step === 14 && state.stage === 'lesson' ? 'lena' : actor, at, branch: 'training', command }, at)
    if (result.error) {
      setFeedback([result.error])
      return
    }
    update({ sandbox: result.state })
    setFeedback([])
    return 'sandbox'
  }) satisfies Dispatch
  const finish = () => {
    setInput(''); setMini(''); setModifier(false); setFeedback([])
    if (state.step + 1 >= curriculum.length) update({ stage: 'exam', sandbox: sandbox(), blocked: false })
    else update({ step: state.step + 1 })
  }
  const action = (command: Command, done = true) => { void dispatch(command).then(result => { if (result && done) finish() }) }
  const toggle = (key: string) => setFavorites(list => list.includes(key) ? list.filter(value => value !== key) : [...list, key])
  const ensure = (expected: boolean, message: string) => expected ? finish() : setFeedback([message])
  const lesson = state.stage === 'lesson'
  const exam = state.stage === 'exam'

  function controls() {
    switch (state.step) {
      case 0:
        return <><Button onClick={() => setMini('summary')}>Сводка смены</Button>{mini && <><p className="callout">Свободно 12 столов · к выдаче 0 блюд</p><Button primary onClick={finish}>Продолжить</Button></>}</>
      case 1:
        return <div className="row"><Button onClick={() => setFeedback(['Сейчас вы в зале. Откройте «Заказы».'])}>Зал</Button><Button primary onClick={finish}>Заказы</Button></div>
      case 2:
        return <Hall data={data} branch={state.branch} actor={actor} now={Date.now()} mode={map} setMode={setMap} open={key => ensure(map === 'list' && key === 't1', 'Откройте стол 1 в режиме «Список».')} orders={() => setFeedback(['Для задания нужен список столов.'])}/>
      case 3:
        return <OpenTable table="t1" dispatch={async command => {
          if (command.type === 'open' && Object.keys(command.guests).length !== 2) { setFeedback(['Укажите двух гостей.']); return }
          return dispatch(command)
        }} done={finish}/>
      case 4:
        return order && <Button primary onClick={() => action({ type: 'guest', order: order.id, seat: { id: id(), name: 'Гость 3' } })}>Добавить гостя</Button>
      case 5:
      case 8:
      case 9:
        return <><Catalog key={state.step} stock={data.stock} favorites={favorites} toggle={toggle} add={key => {
          if (state.step === 5 && key === 'd0-2' && order) action({ type: 'add', order: order.id, line: makeLine(dish(key)!, actor) })
          else if (state.step === 8) ensure(key === 'd7-0', 'Найдите чизкейк в каталоге.')
          else if (state.step === 5) setFeedback(['Для задания нужен капучино.'])
        }}/>{state.step === 9 && <Button onClick={() => ensure(favorites.includes('d0-2'), 'Сначала добавьте капучино в избранное.')}>Проверить избранное</Button>}</>
      case 6:
        return order && line && <div className="row wrap">{Object.values(order.guests).map((seat, index) => <Button key={seat.id} onClick={() => {
          if (index === 0) action({ type: 'edit', order: order.id, version: line.version, line: line.id, patch: { guest: seat.id } })
          else setFeedback(['Пожелание относится к первому гостю.'])
        }}>{seat.name}</Button>)}</div>
      case 7:
        return order && line && <><label className="row"><input type="checkbox" checked={modifier} onChange={event => setModifier(event.target.checked)}/> Овсяное молоко</label><label>Комментарий<input value={input} onChange={event => setInput(event.target.value)}/></label><Button primary onClick={() => {
          if (modifier && input.trim()) action({ type: 'edit', order: order.id, line: line.id, version: line.version, patch: { modifiers: 'Овсяное молоко', note: input } })
          else setFeedback(['Выберите овсяное молоко и добавьте комментарий.'])
        }}>Сохранить позицию</Button></>
      case 10:
        return <Button primary onClick={() => action({ type: 'stock', item: 'd7-0', version: stock?.version ?? 0, count: 0, reason: 'Учебное изменение' })}>Чизкейк закончился</Button>
      case 11:
        return <><label>Порций<input type="number" min="1" value={input} onChange={event => setInput(event.target.value)}/></label><Button primary onClick={() => {
          if (Number(input) === 1) action({ type: 'stock', item: 'd7-0', count: 1, reason: 'Учебная поставка', version: stock.version })
          else setFeedback(['В витрине осталась одна порция.'])
        }}>Сохранить остаток</Button></>
      case 12:
        return order && line && <Button primary onClick={() => line.status === 'draft' ? action({ type: 'send', order: order.id, lines: versions([line]) }, false) : action({ type: 'status', order: order.id, lines: versions([line]), status: 'ready' })}>{line.status === 'draft' ? 'Подтвердить заказ' : 'Отметить готовность'}</Button>
      case 13:
        return order && line && <Button primary onClick={() => action({ type: 'status', order: order.id, lines: versions([line]), status: 'served' })}>Выдано гостю</Button>
      case 14:
        return order && <><label>Комментарий от Лены<input value={input} onChange={event => setInput(event.target.value)}/></label><Button primary onClick={() => {
          if (input.trim()) action({ type: 'note', order: order.id, previous: order.note, note: input }); else setFeedback(['Введите комментарий.'])
        }}>Сохранить</Button></>
      case 15:
        return order && <Button primary onClick={() => action({ type: 'transfer', orders: { [order.id]: order.owner }, owner: 'artem' })}>Передать Артёму</Button>
      case 16:
        return <><label>Кухня<input value={input} onChange={event => setInput(event.target.value)}/></label><Button primary onClick={() => {
          if (input.trim()) action({ type: 'message', chat: 'kitchen', message: { id: id(), actor, at: Date.now(), text: input.trim() } })
          else setFeedback(['Введите текст сообщения.'])
        }}>Отправить в песочнице</Button></>
      case 17:
        return <><Button onClick={() => setOnline(value => !value)}><WifiOff size={16}/>{online ? 'Отключить сеть' : 'Нет соединения'}</Button><Button primary onClick={() => {
          if (!online && order) action({ type: 'add', order: order.id, line: makeLine(dish('d0-1')!, actor) })
          else setFeedback(['Сначала отключите сеть песочницы.'])
        }}>Сохранить черновик</Button></>
      default:
        return <><Button onClick={() => { setOnline(true); setMini('online') }}>Восстановить соединение</Button><Button primary onClick={() => {
          const drafts = order && linesOf(order).filter(value => value.status === 'draft')
          if (order && drafts?.length && mini) action({ type: 'send', order: order.id, lines: versions(drafts) })
          else setFeedback(['Восстановите соединение перед подтверждением.'])
        }}>Синхронизировать</Button></>
    }
  }

  return <main className="onboarding">
    <header className="row spread"><Brand/><span className="demo-badge">Тестовый режим</span></header>
    <section className="panel onboarding-card stack">
      {state.stage === 'welcome' && <><img src={asset('icons/app.svg')} width={74} height={74} alt=""/><h1>Добро пожаловать в Waiter</h1><p className="muted">Выберите вымышленный профиль, пройдите Академию и начните тестовую смену.</p><Button primary onClick={() => update({ stage: 'profile' })}>Начать <ArrowRight size={16}/></Button></>}
      {state.stage === 'profile' && <><h1>Выберите профиль</h1><p className="muted">Демонстрационные сотрудники. Вход по паролю не требуется.</p>
        <div className="profile-grid">{staff.map(item => <button className="panel card row" key={item.id} onClick={() => update({ actor: item.id, stage: 'branch' })}><Avatar actor={item.id}/><span><strong>{item.name}</strong><small>{item.role}</small></span></button>)}</div>
      </>}
      {state.stage === 'branch' && <><h1>В какой кофейне смена?</h1>{branches.map(item => <Button key={item.id} onClick={() => update({ branch: item.id, stage: 'sasha', step: 0, sandbox: sandbox(), blocked: false })}><Coffee size={17}/>{item.name}</Button>)}</>}
      {state.stage === 'sasha' && <><img src={asset('icons/sasha.svg')} width={100} height={100} alt="Саша"/><h1>Знакомьтесь, Саша</h1><p>{greeting}</p><Button primary onClick={() => update({ stage: 'lesson', step: 0, sandbox: sandbox() })}><BookOpen size={17}/> Начать обучение</Button></>}
      {lesson && <>
        <div className="row spread"><span className="demo-badge">Учебная песочница</span><small>{state.step + 1} из {curriculum.length}</small></div>
        <progress aria-label="Прогресс обучения" max={curriculum.length} value={state.step + 1}/>
        <div className="row"><img src={asset('icons/sasha.svg')} width={52} height={52} alt="Саша"/><div><h1>{curriculum[state.step][0]}</h1><p className="muted">{curriculum[state.step][1]}</p></div></div>
        <div className="training-task stack">{controls()}</div>
        <Button onClick={() => { setMini(''); setInput(''); setModifier(false); setMap('map'); setFeedback([]) }}>Повторить подсказку</Button>
      </>}
      {exam && <>
        <h1>Практический экзамен</h1><p className="muted">Ведите виртуальный стол до завершения. Результат зависит от выполненных в песочнице действий.</p>
        {!order && <><label>Виртуальный стол<select value={preview} onChange={event => setPreview(event.target.value)}><option value="t1">Стол 1</option><option value="t2">Стол 2</option></select></label><OpenTable table={preview} dispatch={dispatch} done={() => setFeedback([])}/></>}
        {order && <OrderEditor order={order} data={data} actor={actor} branch={state.branch} now={Date.now()} dispatch={dispatch} favorites={favorites} toggle={toggle} observeDish={key => {
          if (data.stock[key]?.count === 0) update({ blocked: true })
        }}/>}
        {(order?.state === 'closed' || !order) && <Button primary onClick={() => {
          const errors = examErrors(ref.current.sandbox ?? data, Boolean(ref.current.blocked))
          if (errors.length) setFeedback(errors)
          else update({ stage: 'certificate', certificate: { token: id(), at: Date.now(), score: 100, version } })
        }}>Проверить результат</Button>}
        {order && <Button onClick={() => { update({ sandbox: sandbox(), blocked: false }); setFeedback([]) }}>Начать попытку заново</Button>}
      </>}
      {state.stage === 'certificate' && state.certificate && <><Certificate actor={actor} certificate={state.certificate}/><Button primary onClick={() => update({ stage: 'work', sandbox: undefined })}>Открыть рабочий интерфейс</Button></>}
      {feedback.length > 0 && <div role="alert" className="panel pad danger-text">{feedback.map(message => <p key={message}>{message}</p>)}</div>}
      {lesson && <Empty><Check size={15} className="inline"/> Учебные операции остаются на этом устройстве.</Empty>}
    </section>
  </main>
}
