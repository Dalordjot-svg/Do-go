import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { Installation, useInstallation } from './installation'
import './styles.css'

function App() {
  const installation = useInstallation()
  const [dev, setDev] = useState(false)
  if (!installation.standalone && !(import.meta.env.DEV && dev)) return <Installation state={installation} enterDev={() => setDev(true)}/>
  return <main className="onboarding"><h1>COFFEEMAN Waiter</h1></main>
}
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><App/></MotionConfig>)
