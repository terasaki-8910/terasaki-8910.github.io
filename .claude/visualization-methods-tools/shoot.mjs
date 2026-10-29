// ページのタブの「全体」と各段階を、要素ごとに撮る(確かめ用)。
//   node shoot.mjs <url> <outDir> --tab shape [--width 1280] [--height 900] [--theme light|dark] [--steps 1,2,3] [--full]
// url は /visualization-methods/ まで。タブは #id で開く。コンソールのエラーは errors.txt に書く。
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW_CORE || 'playwright-core')

const args = process.argv.slice(2)
const url = args[0]
const outDir = args[1]
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const has = (name) => args.includes(`--${name}`)
const tab = opt('tab', 'shape')
const width = Number(opt('width', '1280'))
const height = Number(opt('height', '900'))
const theme = opt('theme', 'light')
const stepsArg = opt('steps', '')
const full = has('full')

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(opt('dpr', '1')) })
const page = await context.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

await page.goto(`${url}#${tab}`, { waitUntil: 'networkidle' })
// 要素ごとに撮るとき、上の固定ヘッダーが重なるので隠す(全体の 1 枚には出す)
if (!full) await page.addStyleTag({ content: 'header, .fixed.top-0 { visibility: hidden !important; }' })
if (theme === 'dark') {
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
}
await page.waitForTimeout(800)

// 段階の絵は近づいてから作られるので、下までゆっくりたどる
const total = await page.evaluate(() => document.body.scrollHeight)
for (let y = 0; y < total; y += Math.floor(height * 0.7)) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y)
  await page.waitForTimeout(250)
}
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(600)

const tag = `${tab}-${width}-${theme}`
if (full) {
  await page.screenshot({ path: join(outDir, `${tag}-full.png`), fullPage: true })
}
const overview = page.locator('.vis-overview').first()
if (await overview.count()) {
  await overview.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await overview.screenshot({ path: join(outDir, `${tag}-overview.png`) })
}
const stepCount = await page.locator('.vis-step').count()
const wanted = stepsArg ? stepsArg.split(',').map(Number) : Array.from({ length: stepCount }, (_, i) => i + 1)
for (const n of wanted) {
  const el = page.locator(`#${tab}-step-${n}`)
  if (!(await el.count())) continue
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await el.screenshot({ path: join(outDir, `${tag}-step${n}.png`) })
}
// 横のはみ出し
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
writeFileSync(join(outDir, `${tag}-errors.txt`), [`overflowX=${overflow}`, `steps=${stepCount}`, ...errors].join('\n'))
console.log(`${tag}: steps=${stepCount} overflowX=${overflow} errors=${errors.length}`)
await browser.close()
