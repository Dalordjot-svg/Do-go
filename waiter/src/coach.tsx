import { useLayoutEffect, useState } from 'react'
import { motion } from 'motion/react'
import { asset, Button } from './ui'
import { lessonNames } from './academy'

export type Prompt = { target: string; text: string }
export function Coach({ prompt, step, exam, errors, verify, reset, restart }: {
  prompt: Prompt; step: number; exam: boolean; errors: string[]; verify: () => void; reset: () => void; restart: () => void
}) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number }>()
  useLayoutEffect(() => {
    if (exam) return
    const app = document.querySelector('.app-shell')
    let frame = 0
    let highlighted: Element | undefined
    const draw = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const target = prompt.target.split('|').flatMap(key => Array.from(document.querySelectorAll(`[data-coach="${key}"]`))).find(node => node.getClientRects().length)
        if (target !== highlighted) { highlighted?.removeAttribute('data-coach-focused'); target?.setAttribute('data-coach-focused', ''); highlighted = target }
        const box = target?.getBoundingClientRect()
        if (!box || box.height === 0 || box.bottom <= 0 || box.top >= innerHeight) { setRect(undefined); return }
        const scroll = target?.closest('.page, .order-scroll')?.getBoundingClientRect()
        const y = Math.max(box.top, scroll?.top ?? 0)
        const bottom = Math.min(box.bottom, scroll?.bottom ?? innerHeight)
        setRect(bottom > y ? { left: box.left, top: y, width: box.width, height: bottom - y } : undefined)
      })
    }
    const observer = new ResizeObserver(draw)
    if (app) observer.observe(app)
    const changes = new MutationObserver(draw)
    if (app) changes.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })
    addEventListener('resize', draw)
    addEventListener('scroll', draw, true)
    draw()
    return () => { highlighted?.removeAttribute('data-coach-focused'); observer.disconnect(); changes.disconnect(); removeEventListener('resize', draw); removeEventListener('scroll', draw, true); cancelAnimationFrame(frame) }
  }, [prompt.target, exam])
  return <>
    {!exam && rect && <div aria-hidden="true" className="coach-spotlight" style={rect}/>}
    <motion.aside className="coach-sheet" role="region" aria-label={exam ? 'Практический экзамен' : 'Подсказка Саши'} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>
      <img src={asset('icons/sasha.svg')} alt="Саша" className="sasha-avatar" width="48" height="48"/>
      <div className="coach-copy" aria-live="polite">
        <div className="row spread"><h2>{exam ? 'Практический экзамен' : lessonNames[step]}</h2>{!exam && <small>{step + 1}/{lessonNames.length}</small>}</div>
        {!exam && <progress aria-label="Прогресс обучения" max={lessonNames.length} value={step + 1}/>}
        <p>{exam ? 'Проведите учебный стол от открытия до расчёта.' : prompt.text}</p>
        {errors.length > 0 && <ul className="coach-errors">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
        {exam ? <div className="row wrap"><Button primary onClick={verify}>Проверить результат</Button><Button onClick={reset}>Новая попытка</Button></div> :
          <details className="coach-options"><summary>Учебный сценарий</summary><button className="text-button" onClick={restart}>Начать сценарии заново</button></details>}
      </div>
    </motion.aside>
  </>
}
