const sv = `const sv=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};`
const login = sv + `sv(document.querySelector('input[type=email]'),${JSON.stringify(process.argv[2])});sv(document.querySelector('input[type=password]'),${JSON.stringify(process.argv[3])});document.querySelector('form button[type=submit]').click();`
const check = (ctx) => `
  const tactil = matchMedia('(pointer: coarse)').matches, minimo = tactil ? 44 : 36;
  const modal = document.querySelector('dialog[open]');
  const root = modal ?? document;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[aria-hidden=true]') };
  const els = [...root.querySelectorAll('button, a[href]')].filter(vis).filter(el => modal || !el.closest('dialog'));
  const fallas = [];
  const primarios = els.filter(el => /bg-brand-600/.test(el.className) && !el.disabled).map(el => el.innerText.trim());
  // Solo cuenta primarios fuera de tarjetas paralelas (PAC/PAT) y filas de nóminas (cada una es su propio contexto)
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const nombre = (el.getAttribute('aria-label') || el.innerText || '').trim().split(String.fromCharCode(10)).join(' ').slice(0, 35);
    const soloIcono = !el.innerText.trim();
    const esFilaOTab = el.closest('nav') || el.closest('ul.divide-y > li > button') === el;
    const alto = Math.round(r.height), ancho = Math.round(r.width);
    if (!esFilaOTab && (alto < minimo - 0.5 || (soloIcono && ancho < minimo - 0.5))) {
      // enlaces/acciones de texto: se mide el área de toque real (padding), no el texto
      fallas.push('TAMAÑO ' + ancho + 'x' + alto + ' < ' + minimo + ': ' + nombre);
    }
    if (soloIcono && !el.getAttribute('aria-label')) fallas.push('SIN NOMBRE: ' + el.outerHTML.slice(0, 60));
    if (soloIcono && el.tagName === 'BUTTON' && !el.title && !el.closest('label')) fallas.push('SIN TEXTO AL PASAR EL MOUSE: ' + nombre);
  }
  return { ctx: ${JSON.stringify(ctx)}, tactil, botones: els.length, primarios, fallas: [...new Set(fallas)] }`
const abrir = (texto, i = 0) => `[...document.querySelectorAll('main button')].filter(b=>b.innerText.includes(${JSON.stringify(texto)}))[${i}].click()`
const cerrar = `window.confirm=()=>true; document.querySelector('dialog[open] button[aria-label=Cerrar]')?.click(); await new Promise(r=>setTimeout(r,300))`
export default [
  { url: 'http://localhost:5173/#/socios', wait: 2000, js: check('Login') },
  { js: login, wait: 2500 },
  { js: check('Socios') },
  { js: abrir('Nuevo socio'), wait: 800 }, { js: `document.querySelector('dialog[open] input[type=checkbox]').click()`, wait: 300 }, { js: check('Socios › Nuevo socio') }, { js: cerrar },
  { js: `document.querySelector('button[aria-label^="Editar a"]').click()`, wait: 900 }, { js: check('Socios › Editar') }, { js: cerrar },
  { js: `document.querySelector('button[aria-label^="Eliminar a"]').click()`, wait: 600 }, { js: check('Socios › Confirmar eliminar') }, { js: `[...document.querySelectorAll('dialog[open] button')].find(b=>b.innerText==='Cancelar').click()`, wait: 300 },
  { js: abrir('Importar Excel'), wait: 1200 }, { js: check('Socios › Importar') }, { js: cerrar },
  { js: `location.hash='#/cobros'`, wait: 1800 }, { js: check('Cobros') },
  { js: abrir('Generar nómina', 1), wait: 1500 }, { js: check('Cobros › Generar nómina') }, { js: cerrar },
  { js: `location.hash='#/proveedores'`, wait: 1500 }, { js: check('Proveedores') },
  { js: abrir('Nuevo proveedor'), wait: 700 }, { js: check('Proveedores › Nuevo') }, { js: cerrar },
  { js: `[...document.querySelectorAll('button[aria-label^="Eliminar "]')][0].click()`, wait: 600 }, { js: check('Proveedores › Eliminar (con socios)') }, { js: `[...document.querySelectorAll('dialog[open] button')].find(b=>b.innerText==='Entendido')?.click()`, wait: 300 },
  { js: `location.hash='#/categorias'`, wait: 1500 }, { js: check('Categorías') },
  { js: abrir('Nueva categoría'), wait: 700 }, { js: check('Categorías › Nueva') }, { js: cerrar },
]
