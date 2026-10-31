import Dexie from 'dexie'

export const db = new Dexie('gestion-jorgito')

db.version(1).stores({
  productos: '++id, nombre, codigo, categoria, activo',
  clientes: '++id, nombre',
  presupuestos: '++id, numero, fecha, clienteId, estado',
  ventas: '++id, fecha, clienteId, presupuestoId',
  pagos: '++id, fecha, clienteId',
  movimientos: '++id, fecha, productoId, tipo',
  config: 'key',
})

export async function getConfig() {
  const rows = await db.config.toArray()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function setConfig(key, value) {
  return db.config.put({ key, value })
}

async function siguienteNumeroPresupuesto() {
  const row = await db.config.get('ultimoPresupuesto')
  const n = (row?.value || 0) + 1
  await setConfig('ultimoPresupuesto', n)
  return n
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
    }))

export const totalItems = (items) => items.reduce((s, i) => s + i.cantidad * i.precio, 0)

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
  return db.transaction('rw', db.presupuestos, db.config, async () => {
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
    // costo actual de cada producto para calcular ganancia
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
      await db.productos.update(p.id, { stock: (p.stock || 0) - it.cantidad })
      await db.movimientos.add({ fecha, productoId: p.id, tipo: 'venta', cantidad: -it.cantidad, ventaId })
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
      await db.productos.update(p.id, { stock: (p.stock || 0) + it.cantidad })
      await db.movimientos.add({ fecha, productoId: p.id, tipo: 'anulacion', cantidad: it.cantidad, ventaId })
    }
    if (v.presupuestoId) await db.presupuestos.update(v.presupuestoId, { estado: 'pendiente', ventaId: null })
    await db.ventas.delete(ventaId)
  })
}

// Ingreso de mercadería: suma stock y actualiza el costo.
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

export async function aumentarPrecios({ porcentaje, categoria, redondeo }) {
  const factor = 1 + Number(porcentaje) / 100
  const lista = await db.productos.toArray()
  const afectados = lista.filter((p) => !categoria || p.categoria === categoria)
  await db.transaction('rw', db.productos, async () => {
    for (const p of afectados) {
      let precio = p.precio * factor
      if (redondeo > 1) precio = Math.ceil(precio / redondeo) * redondeo
      else precio = Math.round(precio)
      await db.productos.update(p.id, { precio })
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

const TABLAS = ['productos', 'clientes', 'presupuestos', 'ventas', 'pagos', 'movimientos', 'config']

export async function exportarTodo() {
  const datos = { app: 'gestion-jorgito', version: 1, fecha: new Date().toISOString() }
  for (const t of TABLAS) datos[t] = await db.table(t).toArray()
  return datos
}

export async function importarTodo(datos) {
  if (datos?.app !== 'gestion-jorgito') throw new Error('El archivo no es una copia de esta app')
  await db.transaction('rw', TABLAS.map((t) => db.table(t)), async () => {
    for (const t of TABLAS) {
      await db.table(t).clear()
      if (Array.isArray(datos[t])) await db.table(t).bulkAdd(datos[t])
    }
  })
}
