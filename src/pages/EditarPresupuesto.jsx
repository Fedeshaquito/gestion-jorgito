import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, getConfig, guardarPresupuesto } from '../lib/db'
import { $ } from '../lib/format'
import { EditorItems, SelectorCliente, totalDe } from '../components/Carrito'
import { Campo, useToast } from '../components/ui'

export default function EditarPresupuesto() {
  const { id } = useParams()
  const esNuevo = id === 'nuevo'
  const navegar = useNavigate()
  const toast = useToast()
  const [cargado, setCargado] = useState(esNuevo)
  const [presupuesto, setPresupuesto] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [items, setItems] = useState([])
  const [notas, setNotas] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (esNuevo) return
    ;(async () => {
      const p = await db.presupuestos.get(Number(id))
      if (!p) return navegar('/presupuestos')
      setPresupuesto(p)
      setItems(p.items.map((i) => ({ ...i })))
      setNotas(p.notas || '')
      if (p.clienteId) setCliente((await db.clientes.get(p.clienteId)) || null)
      setCargado(true)
    })()
  }, [id, esNuevo, navegar])

  const total = totalDe(items)
  const vendido = presupuesto?.estado === 'vendido'

  async function guardar() {
    const nuevoId = await guardarPresupuesto({ id: presupuesto?.id, cliente, items, notas })
    const p = await db.presupuestos.get(nuevoId)
    setPresupuesto(p)
    if (esNuevo) navegar(`/presupuestos/${nuevoId}`, { replace: true })
    return p
  }

  async function accion(fn) {
    if (!items.length || total <= 0) return toast('Agregá al menos un producto')
    setOcupado(true)
    try {
      await fn()
    } finally {
      setOcupado(false)
    }
  }

  const enviar = () =>
    accion(async () => {
      const p = await guardar()
      const { compartirPresupuesto } = await import('../lib/pdf')
      const resultado = await compartirPresupuesto(p, await getConfig())
      if (resultado === 'descargado') toast('PDF descargado. Adjuntalo en WhatsApp.')
    })

  const descargar = () =>
    accion(async () => {
      const p = await guardar()
      const { verPdf } = await import('../lib/pdf')
      await verPdf(p, await getConfig())
    })

  const pasarAVenta = () =>
    accion(async () => {
      const p = await guardar()
      navegar(`/vender?presupuesto=${p.id}`)
    })

  async function eliminar() {
    if (!confirm('¿Eliminar este presupuesto?')) return
    await db.presupuestos.delete(presupuesto.id)
    navegar('/presupuestos')
  }

  if (!cargado) return null

  return (
    <>
      {presupuesto && (
        <p className="muted" style={{ marginTop: 0 }}>
          Presupuesto N° {presupuesto.numero} {vendido && <span className="chip verde">Ya se vendió</span>}
        </p>
      )}
      <SelectorCliente cliente={cliente} onCambiar={setCliente} />
      <EditorItems items={items} onCambiar={setItems} />
      <div className="tarjeta">
        <Campo label="Notas para el cliente (opcional)">
          <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: entrega el jueves" />
        </Campo>
        <div className="botones">
          <button className="boton" disabled={ocupado} onClick={() => accion(async () => { await guardar(); toast('Guardado') })}>💾 Guardar</button>
          <button className="boton" disabled={ocupado} onClick={descargar}>⬇️ Descargar PDF</button>
        </div>
        <div className="botones" style={{ marginTop: 8 }}>
          {!vendido && <button className="boton verde" disabled={ocupado} onClick={pasarAVenta}>🛒 Pasar a venta</button>}
          {presupuesto && <button className="boton peligro" onClick={eliminar}>Eliminar</button>}
        </div>
      </div>

      <div className="total-barra">
        <div>
          <div className="muted" style={{ color: '#d1d5db' }}>Total</div>
          <div className="valor">{$(total)}</div>
        </div>
        <button className="boton verde" disabled={ocupado} onClick={enviar}>📲 Enviar por WhatsApp</button>
      </div>
    </>
  )
}
