import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Coffee, X } from 'lucide-react'
import { motion } from 'motion/react'
import { person } from './fixtures'
import { useDirectory } from './directory'
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

export function Brand() {
  return <div className="brand"><div className="brand-icon"><Coffee size={22}/></div><div><strong>COFFEEMAN</strong><small>WAITER</small></div></div>
}
export function Avatar({ actor, small }: { actor: string; small?: boolean }) {
  const directory = useDirectory()
  const item = directory.person(actor) ?? person(actor)
  return <span className={`avatar ${item.color} ${small ? 'small' : ''}`} aria-hidden="true">{item.initials}</span>
}
export function useClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(interval)
  }, [])
  return now
}
export function useKeyboardViewport() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const node = root.current
    const resize = () => {
      const focus = document.activeElement
      const typing = focus instanceof HTMLElement && focus.matches('textarea, input:not([type="checkbox"]), [contenteditable="true"]')
      if (typing && Math.abs(viewport.scale - 1) < .01 && viewport.height < innerHeight - 40) {
        node?.style.setProperty('--keyboard-viewport', `${Math.floor(viewport.height)}px`)
      } else node?.style.removeProperty('--keyboard-viewport')
    }
    viewport.addEventListener('resize', resize)
    document.addEventListener('focusin', resize)
    document.addEventListener('focusout', resize)
    return () => {
      viewport.removeEventListener('resize', resize)
      document.removeEventListener('focusin', resize)
      document.removeEventListener('focusout', resize)
    }
  }, [])
  return root
}
export function Button({ children, onClick, primary, disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} className={primary ? 'button primary' : 'button'} onClick={onClick} disabled={disabled}>{children}</button>
}
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div> }
export function Chip({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`chip ${tone ?? ''}`}><i/>{children}</span>
}
export function ScreenTitle({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="screen-title"><div><h1>{title}</h1><p>{children}</p></div>{action}</div>
}
export function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const element = useRef<HTMLDialogElement>(null)
  useEffect(() => { element.current?.showModal() }, [])
  return <dialog ref={element} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
    <motion.div className="dialog-inner" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <header className="row spread"><h2>{title}</h2><button className="icon" aria-label="Закрыть" onClick={close}><X size={20}/></button></header>
      {children}
    </motion.div>
  </dialog>
}
export function InlineLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="text-button" onClick={onClick}>{children}<ArrowUpRight size={15}/></button>
}
