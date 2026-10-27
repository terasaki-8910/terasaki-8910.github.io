// 全部のタブ × 幅 × テーマで、コンソールのエラー・横のはみ出し・段階の数を調べ、全体の絵を撮る(確かめ用)。
//   node check-all.mjs <url> <outDir> [--tabs shape,shading] [--widths 375,768,1024,1280,1440] [--themes light,dark] [--shots]
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
const tabs = opt('tabs', 'shape,shading,isosurface,volume,flow,ct').split(',')
const sizes = opt('widths', '375x800,768x1024,820x1180,1180x820,1024x768,1280x900,1440x900').split(',').map((s) => s.split('x').map(Number))
const themes = opt('themes', 'light,dark').split(',')
const shots = args.includes('--shots')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const rows = []
for (const [w, h] of sizes) {
  for (const theme of themes) {
    const context = await browser.newContext({ viewport: { width: w, height: h || 900 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    for (const tab of tabs) {
      const errors = []
      const onConsole = (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) }
      const onError = (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`)
      page.on('console', onConsole)
      page.on('pageerror', onError)
      await page.goto(`${url}#${tab}`, { waitUntil: 'networkidle' })
      await page.addStyleTag({ content: 'header, .fixed.top-0 { visibility: hidden !important; }' })
      if (theme === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
      await page.waitForTimeout(500)
      const total = await page.evaluate(() => document.body.scrollHeight)
      for (let y = 0; y < total; y += Math.floor((h || 900) * 0.8)) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y)
        await page.waitForTimeout(150)
      }
      const info = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        steps: document.querySelectorAll('.vis-step').length,
        canvases: document.querySelectorAll('.vis-panel canvas').length,
        placeholders: document.querySelectorAll('.vis-panel .vis-placeholder').length,
      }))
      if (shots) {
        await page.evaluate(() => window.scrollTo(0, 0))
        const el = page.locator('.vis-overview').first()
        await el.scrollIntoViewIfNeeded()
        await page.waitForTimeout(400)
        await el.screenshot({ path: join(outDir, `${tab}-${w}-${theme}.png`) })
      }
      rows.push({ tab, w, h, theme, ...info, errors: errors.length, first: errors[0] ?? '' })
      page.off('console', onConsole)
      page.off('pageerror', onError)
    }
    await context.close()
  }
}
await browser.close()
const lines = rows.map((r) => `${r.tab}\t${r.w}x${r.h}\t${r.theme}\tsteps=${r.steps}\tcanvas=${r.canvases}\tplaceholder=${r.placeholders}\toverflow=${r.overflow}\terrors=${r.errors}\t${r.first}`)
writeFileSync(join(outDir, 'report.tsv'), lines.join('\n'))
console.log(lines.filter((l) => !/overflow=0\terrors=0/.test(l)).join('\n') || 'all clean')
console.log(`${rows.length} combinations`)
