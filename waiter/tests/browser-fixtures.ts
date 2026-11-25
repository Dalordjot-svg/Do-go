import type { Page } from '@playwright/test'

export async function enter(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть в режиме разработки' }).click()
}
export async function certified(page: Page, path = '/#hall', actor = 'mila') {
  await enter(page)
  await page.getByRole('heading', { name: 'Добро пожаловать в Waiter' }).waitFor()
  await page.evaluate(async currentActor => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('coffeeman-waiter-v1')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore('settings').put({ key: 'academy', value: { stage: 'work', actor: currentActor, branch: 'center', step: 19, certificate: { token: 'fixture', score: 100, at: Date.now(), version: '1.0' } } })
    })
    db.close()
  }, actor)
  await page.goto(path)
  await page.reload()
}
export const nav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true })
export const click = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' }).click()
