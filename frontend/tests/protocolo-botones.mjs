// Verificador del protocolo de botones (ver comentario en src/components/ui.jsx).
// Recorre cada pestaña y modal con Chrome sin ventana y revisa: tamaño mínimo
// (36 px; 44 px en pantallas táctiles), nombre accesible, texto al pasar el mouse
// y cuántas acciones principales hay.
// Uso (con la app corriendo en http://localhost:5173 y Chrome instalado):
//   node tests/protocolo-botones.mjs <correo> <contraseña> [ancho] [alto]
// Para simular celular táctil: ancho 390, alto 844. Ruta de Chrome: variable CHROME_PATH.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [, , , , w = '1280', h = '860'] = process.argv
const steps = (await import('./pasos-protocolo.mjs')).default
const out = null
const port = 9333
const prof = mkdtempSync(join(tmpdir(), 'cdp-'))
const ch = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${w},${h}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let targets
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(200) } }
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 })
await send('Page.enable'); await send('Runtime.enable')
if (+w < 600) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Browser.setDownloadBehavior', { behavior: 'deny' })
const logs = []
for (const s of steps) {
  if (s.url) { await send('Page.navigate', { url: s.url }); await sleep(s.wait ?? 1500) }
  if (s.js) { const r = await send('Runtime.evaluate', { expression: `(async()=>{${s.js}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) logs.push('ERR ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); else if (r.result?.result?.value !== undefined) logs.push(JSON.stringify(r.result.result.value)); await sleep(s.wait ?? 600) }
  if (s.shot && out) { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!s.full }); writeFileSync(`${out}-${s.shot}.png`, Buffer.from(r.result.data, 'base64')); logs.push('shot ' + s.shot) }
}
let fallas = 0
for (const l of logs) {
  if (l.startsWith('ERR')) { console.log(l); fallas++; continue }
  if (!l.startsWith('{')) continue
  const d = JSON.parse(l)
  console.log((d.fallas.length ? '✗ ' : '✓ ') + d.ctx + (d.primarios.length ? '  · principal: ' + d.primarios.join(', ') : ''))
  d.fallas.forEach((f) => console.log('     ' + f))
  fallas += d.fallas.length
}
console.log(fallas ? `\n${fallas} incumplimiento(s)` : '\nTodas las pantallas cumplen el protocolo')
process.exitCode = fallas ? 1 : 0
ws.close(); ch.kill()
