import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { $, fecha, linkWhatsApp } from './format'
import { nombreLinea } from './db'

async function dimensionesImagen(dataUrl) {
  return new Promise((ok) => {
    const img = new Image()
    img.onload = () => ok({ w: img.width, h: img.height })
    img.onerror = () => ok(null)
    img.src = dataUrl
  })
}

export async function generarPdfPresupuesto(presupuesto, config) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()
  const margen = 15
  let y = margen

  if (config.logo) {
    const dim = await dimensionesImagen(config.logo)
    if (dim) {
      const alto = 25
      const w = Math.min((dim.w / dim.h) * alto, 60)
      const h = (dim.h / dim.w) * w
      const formato = config.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(config.logo, formato, margen, y, w, h)
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('PRESUPUESTO', ancho - margen, y + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`N° ${String(presupuesto.numero).padStart(5, '0')}`, ancho - margen, y + 12, { align: 'right' })
  doc.text(`Fecha: ${fecha(presupuesto.fecha)}`, ancho - margen, y + 17, { align: 'right' })

  y += 30
  doc.setFontSize(10)
  // si hay logo, el nombre ya está en el logo
  const datosNegocio = [config.logo ? '' : config.negocioNombre, config.negocioTelefono, config.negocioDireccion].filter(Boolean)
  datosNegocio.forEach((linea, i) => doc.text(linea, margen, y + 5 + i * 5))

  if (presupuesto.clienteNombre) {
    doc.setFont('helvetica', 'bold')
    doc.text('Cliente:', ancho / 2 + 10, y)
    doc.setFont('helvetica', 'normal')
    doc.text(presupuesto.clienteNombre, ancho / 2 + 27, y)
  }

  y += 8 + datosNegocio.length * 5

  autoTable(doc, {
    startY: y,
    head: [['Producto', 'Cant.', 'Precio unit.', 'Subtotal']],
    body: presupuesto.items.map((i) => [nombreLinea(i), String(i.cantidad), $(i.precio), $(i.cantidad * i.precio)]),
    foot: [['', '', 'TOTAL', $(presupuesto.total)]],
    theme: 'striped',
    headStyles: { fillColor: [31, 41, 55] },
    footStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 12 },
    columnStyles: {
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 34 },
    },
    margin: { left: margen, right: margen },
    didParseCell: (d) => {
      if (d.section !== 'body' && d.column.index > 0) d.cell.styles.halign = d.column.index === 1 ? 'center' : 'right'
    },
  })

  let fin = doc.lastAutoTable.finalY + 10
  doc.setFontSize(9)
  doc.setTextColor(90)
  if (presupuesto.notas) {
    doc.text(doc.splitTextToSize(presupuesto.notas, ancho - margen * 2), margen, fin)
    fin += 10
  }
  if (config.pieTexto) doc.text(doc.splitTextToSize(config.pieTexto, ancho - margen * 2), margen, fin)

  return doc
}

const nombreArchivo = (p) => `Presupuesto-${String(p.numero).padStart(5, '0')}.pdf`

// Intenta compartir el PDF con el menú del teléfono (WhatsApp aparece ahí).
// Si el navegador no lo permite, lo descarga y abre WhatsApp con el texto.
export async function compartirPresupuesto(presupuesto, config) {
  const doc = await generarPdfPresupuesto(presupuesto, config)
  const blob = doc.output('blob')
  const archivo = new File([blob], nombreArchivo(presupuesto), { type: 'application/pdf' })
  const texto = `Hola${presupuesto.clienteNombre ? ' ' + presupuesto.clienteNombre : ''}! Te paso el presupuesto N° ${presupuesto.numero} por ${$(presupuesto.total)}.`

  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombreArchivo(presupuesto), text: texto })
      return 'compartido'
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelado'
    }
  }
  descargarPdf(doc, presupuesto)
  window.open(linkWhatsApp(presupuesto.clienteTelefono, texto), '_blank')
  return 'descargado'
}

export function descargarPdf(doc, presupuesto) {
  doc.save(nombreArchivo(presupuesto))
}

export async function verPdf(presupuesto, config) {
  const doc = await generarPdfPresupuesto(presupuesto, config)
  descargarPdf(doc, presupuesto)
}
