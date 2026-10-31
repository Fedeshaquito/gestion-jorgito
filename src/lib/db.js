import Dexie from 'dexie'
import logoPorDefecto from '../assets/logo-mayorista-jt.png'

export const db = new Dexie('mayorista-jt')

// Los ids son textos únicos (UUID) para que dos dispositivos no generen el mismo id.
db.version(1).stores({
  productos: 'id, nombre, categoria, updatedAt',
  clientes: 'id, nombre, updatedAt',
  presupuestos: 'id, numero, fecha, clienteId, estado, updatedAt',
  ventas: 'id, fecha, clienteId, presupuestoId, updatedAt',
  pagos: 'id, fecha, clienteId, updatedAt',
  movimientos: 'id, fecha, productoId, tipo, updatedAt',
  config: 'key, updatedAt',
})

export const TABLAS_SYNC = ['productos', 'clientes', 'presupuestos', 'ventas', 'pagos', 'movimientos', 'config']

// ---- Marcas de tiempo y borrados, para poder sincronizar ----
let aplicandoRemoto = false
export async function comoRemoto(fn) {
  aplicandoRemoto = true
  try {
    return await fn()
  } finally {
    aplicandoRemoto = false
  }
}

const listeners = new Set()
export const alCambiarLocal = (fn) => (listeners.add(fn), () => listeners.delete(fn))
const avisar = () => setTimeout(() => listeners.forEach((fn) => fn()), 0)

const CLAVE_BORRADOS = 'mjt-borrados'
export const leerBorrados = () => JSON.parse(localStorage.getItem(CLAVE_BORRADOS) || '[]')
export const guardarBorrados = (lista) => localStorage.setItem(CLAVE_BORRADOS, JSON.stringify(lista))

for (const nombre of TABLAS_SYNC) {
  const t = db.table(nombre)
  t.hook('creating', function (pk, obj) {
    if (aplicandoRemoto) return
    obj.updatedAt = Date.now()
    avisar()
    if (pk === undefined && nombre !== 'config') {
      const id = crypto.randomUUID()
      obj.id = id
      return id
    }
  })
  t.hook('updating', function () {
    if (aplicandoRemoto) return
    avisar()
    return { updatedAt: Date.now() }
  })
  t.hook('deleting', function (pk) {
    if (aplicandoRemoto) return
    guardarBorrados([...leerBorrados(), { tabla: nombre, id: String(pk), t: Date.now() }])
    avisar()
  })
}

// ---- Configuración ----
export const CONFIG_INICIAL = {
  negocioNombre: 'Mayorista JT',
  pieTexto: 'Precios sujetos a modificación sin previo aviso. ¡Gracias por elegirnos!',
}

export async function getConfig() {
  const rows = await db.config.toArray()
  const cfg = { ...CONFIG_INICIAL, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) }
  if (!cfg.logo) cfg.logo = await logoComoDataUrl()
  return cfg
}

let logoCache
async function logoComoDataUrl() {
  if (logoCache) return logoCache
  const blob = await (await fetch(logoPorDefecto)).blob()
  logoCache = await new Promise((ok) => {
    const r = new FileReader()
    r.onload = () => ok(r.result)
    r.readAsDataURL(blob)
  })
  return logoCache
}

export function setConfig(key, value) {
  return db.config.put({ key, value })
}

// ---- Productos y unidades ----
// factor = cuántas unidades representa una línea (1 si es por unidad, N si es por bulto)
export const unidadesDe = (item) => item.cantidad * (item.factor || 1)

export async function crearProducto(datos, stockInicial = 0) {
  return db.transaction('rw', db.productos, db.movimientos, async () => {
    const id = await db.productos.add({ ...datos, stock: Number(stockInicial) || 0 })
    if (stockInicial) {
      await db.movimientos.add({ fecha: new Date().toISOString(), productoId: id, tipo: 'inicial', cantidad: Number(stockInicial) })
    }
    return id
  })
}

async function siguienteNumeroPresupuesto() {
  const ultimo = await db.presupuestos.orderBy('numero').last()
  return (ultimo?.numero || 0) + 1
}

const limpiarItems = (items) =>
  items
    .filter((i) => i.cantidad > 0)
    .map((i) => ({
      productoId: i.productoId,
      nombre: i.nombre,
      cantidad: Number(i.cantidad),
      precio: Number(i.precio),
      costo: Number(i.costo || 0),
      factor: Number(i.factor || 1),
      modo: i.modo || 'unidad',
    }))

export const totalItems = (items) => items.reduce((s, i) => s + i.cantidad * i.precio, 0)
export const nombreLinea = (i) => (i.factor > 1 ? `${i.nombre} (bulto x${i.factor})` : i.nombre)
export const gananciaItem = (i) => i.cantidad * i.precio - unidadesDe(i) * (i.costo || 0)

export async function guardarPresupuesto({ id, cliente, items, notas }) {
  const limpios = limpiarItems(items)
  const datos = {
    clienteId: cliente?.id ?? null,
    clienteNombre: cliente?.nombre ?? '',
    clienteTelefono: cliente?.telefono ?? '',
    items: limpios,
    total: totalItems(limpios),
    notas: notas || '',
  }
  if (id) {
    await db.presupuestos.update(id, datos)
    return id
  }
  return db.transaction('rw', db.presupuestos, async () => {
    const numero = await siguienteNumeroPresupuesto()
    return db.presupuestos.add({ ...datos, numero, fecha: new Date().toISOString(), estado: 'pendiente' })
  })
}

// Registra una venta: descuenta stock y deja asentado el movimiento.
export async function registrarVenta({ cliente, items, pagado, medioPago, presupuestoId, notas }) {
  const limpios = limpiarItems(items)
  const total = totalItems(limpios)
  return db.transaction('rw', db.ventas, db.productos, db.movimientos, db.presupuestos, async () => {
    const fecha = new Date().toISOString()
    for (const it of limpios) {
      const p = it.productoId ? await db.productos.get(it.productoId) : null
      if (p) it.costo = Number(p.costo || 0)
    }
    const ventaId = await db.ventas.add({
      fecha,
      clienteId: cliente?.id ?? null,
      clienteNombre: cliente?.nombre ?? '',
      items: limpios,
      total,
      pagado: Math.min(Number(pagado ?? total), total),
      medioPago: medioPago || 'efectivo',
      presupuestoId: presupuestoId ?? null,
      notas: notas || '',
    })
    for (const it of limpios) {
      if (!it.productoId) continue
      const p = await db.productos.get(it.productoId)
      if (!p) continue
      await db.productos.update(p.id, { stock: (p.stock || 0) - unidadesDe(it) })
      await db.movimientos.add({ fecha, productoId: p.id, tipo: 'venta', cantidad: -unidadesDe(it), ventaId })
    }
    if (presupuestoId) await db.presupuestos.update(presupuestoId, { estado: 'vendido', ventaId })
    return ventaId
  })
}

export async function anularVenta(ventaId) {
  return db.transaction('rw', db.ventas, db.productos, db.movimientos, db.presupuestos, async () => {
    const v = await db.ventas.get(ventaId)
    if (!v) return
    const fecha = new Date().toISOString()
    for (const it of v.items) {
      if (!it.productoId) continue
      const p = await db.productos.get(it.productoId)
      if (!p) continue
      await db.productos.update(p.id, { stock: (p.stock || 0) + unidadesDe(it) })
      await db.movimientos.add({ fecha, productoId: p.id, tipo: 'anulacion', cantidad: unidadesDe(it), ventaId })
    }
    if (v.presupuestoId) await db.presupuestos.update(v.presupuestoId, { estado: 'pendiente', ventaId: null })
    await db.ventas.delete(ventaId)
  })
}

// Ingreso de mercadería: suma stock y actualiza el costo (por unidad).
export async function ingresarMercaderia({ productoId, cantidad, costoUnit, nota }) {
  return db.transaction('rw', db.productos, db.movimientos, async () => {
    const p = await db.productos.get(productoId)
    const cambios = { stock: (p.stock || 0) + Number(cantidad) }
    if (costoUnit > 0) cambios.costo = Number(costoUnit)
    await db.productos.update(productoId, cambios)
    await db.movimientos.add({
      fecha: new Date().toISOString(),
      productoId,
      tipo: 'compra',
      cantidad: Number(cantidad),
      costoUnit: Number(costoUnit || p.costo || 0),
      nota: nota || '',
    })
  })
}

export async function ajustarStock({ productoId, nuevoStock, nota }) {
  return db.transaction('rw', db.productos, db.movimientos, async () => {
    const p = await db.productos.get(productoId)
    const dif = Number(nuevoStock) - (p.stock || 0)
    if (dif === 0) return
    await db.productos.update(productoId, { stock: Number(nuevoStock) })
    await db.movimientos.add({ fecha: new Date().toISOString(), productoId, tipo: 'ajuste', cantidad: dif, nota: nota || '' })
  })
}

// El stock real es la suma de todos los movimientos. Se recalcula después de sincronizar
// para que las ventas hechas en dos dispositivos a la vez se sumen bien.
export async function recalcularStock(productoIds) {
  await comoRemoto(() =>
    db.transaction('rw', db.productos, db.movimientos, async () => {
      for (const id of productoIds) {
        const p = await db.productos.get(id)
        if (!p) continue
        const movs = await db.movimientos.where('productoId').equals(id).toArray()
        const stock = movs.reduce((s, m) => s + Number(m.cantidad || 0), 0)
        if (stock !== p.stock) await db.productos.update(id, { stock })
      }
    }),
  )
}

const redondear = (precio, redondeo) => (redondeo > 1 ? Math.ceil(precio / redondeo) * redondeo : Math.round(precio))

export async function aumentarPrecios({ porcentaje, categoria, redondeo }) {
  const factor = 1 + Number(porcentaje) / 100
  const lista = await db.productos.toArray()
  const afectados = lista.filter((p) => !categoria || p.categoria === categoria)
  await db.transaction('rw', db.productos, async () => {
    for (const p of afectados) {
      const cambios = { precio: redondear(p.precio * factor, redondeo) }
      if (p.precioBulto) cambios.precioBulto = redondear(p.precioBulto * factor, redondeo)
      await db.productos.update(p.id, cambios)
    }
  })
  return afectados.length
}

// Saldo que debe cada cliente: lo que no pagó en sus ventas menos los pagos posteriores.
export function calcularSaldos(ventas, pagos) {
  const saldos = {}
  for (const v of ventas) {
    if (!v.clienteId) continue
    saldos[v.clienteId] = (saldos[v.clienteId] || 0) + (v.total - (v.pagado || 0))
  }
  for (const p of pagos) {
    saldos[p.clienteId] = (saldos[p.clienteId] || 0) - p.monto
  }
  return saldos
}

export async function exportarTodo() {
  const datos = { app: 'mayorista-jt', version: 2, fecha: new Date().toISOString() }
  for (const t of TABLAS_SYNC) datos[t] = await db.table(t).toArray()
  return datos
}

export async function importarTodo(datos) {
  if (datos?.app !== 'mayorista-jt') throw new Error('El archivo no es una copia de esta app')
  await db.transaction('rw', TABLAS_SYNC.map((t) => db.table(t)), async () => {
    for (const t of TABLAS_SYNC) {
      await db.table(t).clear()
      if (Array.isArray(datos[t])) await db.table(t).bulkPut(datos[t].map((r) => ({ ...r, updatedAt: Date.now() })))
    }
  })
}
