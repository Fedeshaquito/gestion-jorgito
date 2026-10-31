import { jsPDF } from 'jspdf'
import { $, linkWhatsApp } from './format'

const A4 = { w: 210, h: 297 }
const M = 12 // margen
const COLS = 3
const GAP = 6
const CARD_W = (A4.w - M * 2 - GAP * (COLS - 1)) / COLS
const FOTO = CARD_W - 8
const CARD_H = FOTO + 30

function medidas(dataUrl) {
  return new Promise((ok) => {
    const img = new Image()
    img.onload = () => ok({ w: img.width, h: img.height })
    img.onerror = () => ok(null)
    img.src = dataUrl
  })
}

const formato = (d) => (d.startsWith('data:image/png') ? 'PNG' : 'JPEG')

async function encabezado(doc, config, titulo) {
  let alto = 0
  if (config.logo) {
    const dim = await medidas(config.logo)
    if (dim) {
      const w = 70
      alto = (dim.h / dim.w) * w
      doc.addImage(config.logo, formato(config.logo), (A4.w - w) / 2, M, w, alto)
    }
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(20)
    doc.text(config.negocioNombre || '', A4.w / 2, M + 8, { align: 'center' })
    alto = 10
  }
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(100)
  doc.text(titulo, A4.w / 2, M + alto + 6, { align: 'center' })
  doc.setTextColor(0)
  return M + alto + 12
}

function pie(doc, config) {
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(8).setTextColor(130)
    const datos = [config.negocioNombre, config.negocioTelefono].filter(Boolean).join(' · ')
    doc.text(datos, M, A4.h - 7)
    doc.text(`Página ${i} de ${total}`, A4.w - M, A4.h - 7, { align: 'right' })
    doc.setTextColor(0)
  }
}

export async function generarCatalogo({ productos, categoria, conPrecios, config }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
  const titulo = `Catálogo${categoria ? ' de ' + categoria : ''}${conPrecios ? ' · Precios al ' + hoy : ''}`
  let y = await encabezado(doc, config, titulo)

  // agrupar por categoría
  const grupos = new Map()
  for (const p of [...productos].sort((a, b) => (a.categoria || 'zzz').localeCompare(b.categoria || 'zzz') || a.nombre.localeCompare(b.nombre))) {
    const c = p.categoria || 'Otros'
    if (!grupos.has(c)) grupos.set(c, [])
    grupos.get(c).push(p)
  }
  const mostrarTitulos = !categoria && grupos.size > 1

  const nuevaPagina = () => {
    doc.addPage()
    y = M
  }

  for (const [cat, lista] of grupos) {
    if (mostrarTitulos) {
      if (y + 10 + CARD_H > A4.h - 14) nuevaPagina()
      doc.setFont('helvetica', 'bold').setFontSize(13)
      doc.text(cat.toUpperCase(), M, y + 5)
      doc.setDrawColor(200).line(M, y + 7, A4.w - M, y + 7)
      y += 11
    }
    for (let i = 0; i < lista.length; i += COLS) {
      if (y + CARD_H > A4.h - 14) nuevaPagina()
      const fila = lista.slice(i, i + COLS)
      for (let c = 0; c < fila.length; c++) {
        const p = fila[c]
        const x = M + c * (CARD_W + GAP)
        doc.setDrawColor(225).setFillColor(255, 255, 255).roundedRect(x, y, CARD_W, CARD_H, 3, 3, 'S')
        const fx = x + 4
        const fy = y + 4
        if (p.foto) {
          const dim = await medidas(p.foto)
          if (dim) {
            const escala = Math.min(FOTO / dim.w, FOTO / dim.h)
            const w = dim.w * escala
            const h = dim.h * escala
            doc.addImage(p.foto, formato(p.foto), fx + (FOTO - w) / 2, fy + (FOTO - h) / 2, w, h)
          }
        } else {
          doc.setFillColor(243, 244, 246).roundedRect(fx, fy, FOTO, FOTO, 2, 2, 'F')
          doc.setFontSize(9).setTextColor(160).text('Sin foto', fx + FOTO / 2, fy + FOTO / 2, { align: 'center' })
          doc.setTextColor(0)
        }
        let ty = fy + FOTO + 5
        doc.setFont('helvetica', 'bold').setFontSize(9.5)
        const nombre = doc.splitTextToSize(p.nombre, CARD_W - 8).slice(0, 2)
        doc.text(nombre, fx, ty)
        ty += nombre.length * 4 + 2
        if (conPrecios) {
          doc.setFont('helvetica', 'bold').setFontSize(11)
          doc.text(`${$(p.precio)}`, fx, ty)
          doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110)
          doc.text('c/u', fx + (doc.getStringUnitWidth($(p.precio)) * 11) / doc.internal.scaleFactor + 1.5, ty)
          if (p.unidadesPorBulto > 1) {
            const pb = p.precioBulto || p.precio * p.unidadesPorBulto
            doc.text(`Bulto x${p.unidadesPorBulto}: ${$(pb)}`, fx, ty + 4.5)
          }
          doc.setTextColor(0)
        }
      }
      y += CARD_H + GAP
    }
  }

  if (config.pieTexto) {
    if (y + 10 > A4.h - 14) nuevaPagina()
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100)
    doc.text(doc.splitTextToSize(config.pieTexto, A4.w - M * 2), M, y + 4)
    doc.setTextColor(0)
  }
  pie(doc, config)
  return doc
}

const nombreArchivo = (o) => `Catalogo-${(o.config.negocioNombre || 'catalogo').replace(/\s+/g, '-')}${o.categoria ? '-' + o.categoria.replace(/\s+/g, '-') : ''}.pdf`

export async function descargarCatalogo(opciones) {
  const doc = await generarCatalogo(opciones)
  doc.save(nombreArchivo(opciones))
}

export async function compartirCatalogo(opciones) {
  const doc = await generarCatalogo(opciones)
  const archivo = new File([doc.output('blob')], nombreArchivo(opciones), { type: 'application/pdf' })
  const texto = `¡Hola! Te paso nuestro catálogo actualizado de ${opciones.config.negocioNombre || ''}.`
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: archivo.name, text: texto })
      return 'compartido'
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelado'
    }
  }
  doc.save(archivo.name)
  window.open(linkWhatsApp('', texto), '_blank')
  return 'descargado'
}
