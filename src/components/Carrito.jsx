import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, totalItems } from '../lib/db'
import { $, normalizar } from '../lib/format'
import { numero } from './ui'

// Selector de cliente + productos. Lo usan "Nueva venta" y "Presupuesto".
export function SelectorCliente({ cliente, onCambiar }) {
  const clientes = useLiveQuery(() => db.clientes.orderBy('nombre').toArray(), []) || []
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')

  async function crear() {
    if (!nombre.trim()) return
    const id = await db.clientes.add({ nombre: nombre.trim(), telefono: telefono.trim(), direccion: '', notas: '' })
    onCambiar(await db.clientes.get(id))
    setCreando(false)
    setNombre('')
    setTelefono('')
  }

  if (creando) {
    return (
      <div className="tarjeta">
        <h2>Cliente nuevo</h2>
        <div className="fila">
          <input placeholder="Nombre del negocio" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          <input placeholder="WhatsApp" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <div className="botones" style={{ marginTop: 10 }}>
          <button className="boton" onClick={() => setCreando(false)}>Cancelar</button>
          <button className="boton primario" onClick={crear}>Agregar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="tarjeta">
      <h2>Cliente</h2>
      <div className="fila">
        <select
          value={cliente?.id ?? ''}
          onChange={(e) => onCambiar(clientes.find((c) => c.id === Number(e.target.value)) || null)}
        >
          <option value="">Sin cliente (venta al paso)</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <button className="boton" style={{ flex: '0 0 auto' }} onClick={() => setCreando(true)}>+ Nuevo</button>
      </div>
    </div>
  )
}

export function EditorItems({ items, onCambiar }) {
  const productos = useLiveQuery(() => db.productos.orderBy('nombre').toArray(), []) || []
  const [busqueda, setBusqueda] = useState('')

  const resultados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    if (!q) return []
    return productos
      .filter((p) => p.activo !== false)
      .filter((p) => normalizar(p.nombre).includes(q) || normalizar(p.codigo).includes(q) || normalizar(p.categoria).includes(q))
      .slice(0, 8)
  }, [busqueda, productos])

  function agregar(p) {
    const existente = items.find((i) => i.productoId === p.id)
    if (existente) {
      onCambiar(items.map((i) => (i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i)))
    } else {
      onCambiar([...items, { productoId: p.id, nombre: p.nombre, cantidad: 1, precio: p.precio, costo: p.costo }])
    }
    setBusqueda('')
  }

  const cambiar = (idx, campo, valor) => onCambiar(items.map((i, n) => (n === idx ? { ...i, [campo]: valor } : i)))
  const quitar = (idx) => onCambiar(items.filter((_, n) => n !== idx))
  const stockDe = (id) => productos.find((p) => p.id === id)?.stock

  return (
    <div className="tarjeta">
      <h2>Productos</h2>
      <input
        className="buscador"
        placeholder="🔍 Buscar producto para agregar…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {busqueda && (
        <ul className="lista" style={{ marginBottom: 10 }}>
          {resultados.length === 0 && <li className="muted">No hay productos con ese nombre. Cargalos en Productos.</li>}
          {resultados.map((p) => (
            <li key={p.id} className="clickeable" onClick={() => agregar(p)}>
              <div className="principal-item">
                <div className="titulo">{p.nombre}</div>
                <div className="sub">Stock: {p.stock ?? 0}</div>
              </div>
              <div className="monto">{$(p.precio)}</div>
              <span className="chip azul">+ Agregar</span>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <div className="muted">Todavía no agregaste productos.</div>
      ) : (
        <ul className="lista">
          {items.map((it, idx) => {
            const stock = stockDe(it.productoId)
            const falta = stock !== undefined && it.cantidad > stock
            return (
              <li key={idx} style={{ display: 'block' }}>
                <div className="titulo" style={{ marginBottom: 6 }}>
                  {it.nombre} {falta && <span className="chip ambar">Hay {stock}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="muted">$</span>
                    <input
                      style={{ width: 90, padding: '6px 8px' }}
                      inputMode="decimal"
                      value={it.precio}
                      onChange={(e) => cambiar(idx, 'precio', numero(e.target.value))}
                      aria-label="Precio unitario"
                    />
                  </div>
                  <div className="cantidad">
                    <button aria-label="Restar" onClick={() => (it.cantidad <= 1 ? quitar(idx) : cambiar(idx, 'cantidad', it.cantidad - 1))}>−</button>
                    <input inputMode="numeric" value={it.cantidad} onChange={(e) => cambiar(idx, 'cantidad', numero(e.target.value))} aria-label="Cantidad" />
                    <button aria-label="Sumar" onClick={() => cambiar(idx, 'cantidad', it.cantidad + 1)}>+</button>
                  </div>
                  <div className="monto" style={{ flex: 1 }}>{$(it.cantidad * it.precio)}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export const totalDe = (items) => totalItems(items.filter((i) => i.cantidad > 0))
