import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { certified, click, enter, nav } from './browser-fixtures'

const viewports = [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }]
async function checkLayout(page: Page) {
  const result = await page.evaluate(() => {
    const nav = document.querySelector('.app-nav')!
    const viewport = document.documentElement.clientWidth
    const section = [...document.querySelectorAll('.page, .order-screen')].find(node => node.getClientRects().length)
    return {
      documentOverflow: document.documentElement.scrollWidth - viewport,
      sectionOverflow: Math.max(section ? section.scrollWidth - section.clientWidth : 0,
        ...[...document.querySelectorAll('.order-scroll')].filter(el => el.getClientRects().length).map(el => el.scrollWidth - el.clientWidth)),
      navBottom: nav.getBoundingClientRect().bottom,
      height: innerHeight,
      smallTargets: [...nav.querySelectorAll('button')].filter(el => el.offsetWidth < 44 || el.offsetHeight < 44).length
    }
  })
  expect(result.documentOverflow).toBeLessThanOrEqual(0)
  expect(result.sectionOverflow).toBeLessThanOrEqual(1)
  expect(Math.abs(result.navBottom - result.height)).toBeLessThanOrEqual(1)
  expect(result.smallTargets).toBe(0)
}
async function checkMap(page: Page) {
  const tiles = page.locator('.floor-panel .map-table')
  await expect(tiles).toHaveCount(12)
  const wellPlaced = await tiles.evaluateAll(buttons => {
    const floor = document.querySelector('.floor-panel .floor')!.getBoundingClientRect()
    const bounds = buttons.map(button => button.getBoundingClientRect())
    return bounds.every((box, i) => box.width >= 44 && box.height >= 44 && box.left >= floor.left && box.right <= floor.right && box.top >= floor.top && box.bottom <= floor.bottom &&
      bounds.every((next, j) => i === j || box.right <= next.left + 1 || next.right <= box.left + 1 || box.bottom <= next.top + 1 || next.bottom <= box.top + 1))
  })
  expect(wellPlaced).toBe(true)
}
test('пять размеров, все рабочие вкладки, масштаб карты и 10 скриншотов', async ({ page, browser }, info) => {
  test.setTimeout(90000)
  const dir = process.env.WAITER_SCREENSHOT_DIR ?? info.outputPath('screens')
  await mkdir(dir, { recursive: true })
  const screenshot = (name: string, target = page) => target.screenshot({ path: join(dir, name + '.png'), animations: 'disabled', caret: 'hide' })
  await certified(page, '/#hall', 'ira')
  await expect(page.getByRole('heading', { name: 'Зал', exact: true })).toBeVisible()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await nav(page, 'Зал').click()
    await checkLayout(page)
    await checkMap(page)
    for (const title of ['Заказы', 'Стоп-лист', 'Чаты', 'Профиль']) {
      await nav(page, title).click()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await checkLayout(page)
    }
    await nav(page, 'Зал').click()
    await page.getByRole('button', { name: /^Стол 2, / }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await checkLayout(page)
    await click(page, 'Закрыть')
  }
  await page.setViewportSize(viewports[0])
  await screenshot('01-hall')
  await click(page, 'Увеличить')
  await expect.poll(() => page.locator('.floor-scroller').evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true)
  await page.locator('.floor-scroller').evaluate(e => { e.scrollLeft = 100 })
  await expect.poll(() => page.locator('.floor-scroller').evaluate(e => e.scrollLeft)).toBeGreaterThan(0)
  await click(page, 'Сбросить масштаб')
  await nav(page, 'Заказы').click()
  await click(page, /^Все ·/)
  await screenshot('02-orders')
  await nav(page, 'Зал').click()
  await page.getByRole('button', { name: /^Стол 1, Свободен/ }).click()
  await click(page, 'Открыть стол')
  await click(page, 'Добавить блюда')
  const cappuccino = page.locator('.catalog-item').filter({ hasText: 'Капучино' })
  await cappuccino.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Подтвердить · 1' })).toBeInViewport({ ratio: .95 })
  await screenshot('03-order-entry')
  await nav(page, 'Стоп-лист').click()
  await screenshot('04-inventory')
  await nav(page, 'Чаты').click()
  await expect(page.getByRole('log')).toBeVisible()
  await screenshot('05-chats')
  await page.getByLabel('Сообщение', { exact: true }).focus()
  await page.setViewportSize({ width: 390, height: 500 })
  await checkLayout(page)
  await page.setViewportSize(viewports[0])
  await nav(page, 'Профиль').click()
  await screenshot('06-profile')
  await page.setViewportSize(viewports[4])
  await click(page, 'Панель администратора')
  const admin = page.getByRole('navigation', { name: 'Разделы управления' })
  await expect(admin).toBeVisible()
  await checkLayout(page)
  await screenshot('08-admin')
  await admin.getByRole('button', { name: 'Редактор меню', exact: true }).click()
  await click(page, /^Капучино /)
  await expect(page.getByLabel('Цена, ₽')).toBeVisible()
  await checkLayout(page)
  await screenshot('09-menu-editor')
  await admin.getByRole('button', { name: 'Редактор зала', exact: true }).click()
  await page.getByRole('button', { name: /^Стол 4, / }).click()
  await expect(page.getByLabel('Форма')).toBeVisible()
  await checkLayout(page)
  await screenshot('10-floor-editor')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await checkLayout(page)
    await expect(page.getByLabel('Форма')).toBeVisible()
    await admin.getByRole('button', { name: 'Редактор меню', exact: true }).click()
    await click(page, /^Капучино /)
    await checkLayout(page)
    await admin.getByRole('button', { name: 'Редактор зала', exact: true }).click()
    await page.getByRole('button', { name: /^Стол 4, / }).click()
  }

  await page.setViewportSize(viewports[4])
  for (const title of ['Сотрудники', 'Точки', 'Столы', 'Категории и модификаторы', 'Остатки и стоп-лист', 'Активные заказы',
    'Архив заказов', 'История действий', 'Аналитика', 'Нормативы', 'Обучение', 'Сертификаты', 'Настройки']) {
    await admin.getByRole('button', { name: title, exact: true }).click()
    await expect(page.locator('.admin-content').getByRole('heading', { name: title, exact: true }).first()).toBeVisible()
    await checkLayout(page)
  }

  const training = await browser.newPage({ viewport: viewports[1], baseURL: 'http://127.0.0.1:5173' })
  await enter(training)
  await click(training, 'Начать')
  await click(training, /Мила Соколова/)
  await click(training, 'Кофейня «Центр»')
  await click(training, 'Начать обучение')
  await nav(training, 'Заказы').click()
  await nav(training, 'Зал').click()
  await expect(training.locator('.coach-spotlight')).toBeVisible()
  await checkLayout(training)
  await screenshot('07-training', training)
  await training.close()
})
