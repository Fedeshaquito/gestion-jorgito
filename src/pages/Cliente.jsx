import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { calcularSaldos, db } from '../lib/db'
import { $, fecha, linkWhatsApp } from '../lib/format'
import { Campo, Modal, numero, useToast } from '../components/ui'
import { FormCliente } from './Clientes'
import { MEDIOS } from './NuevaVenta'

export default function Cliente() {
  const id = Number(useParams().id)
  const navegar = useNavigate()
  const toast = useToast()
  const cliente = useLiveQuery(() => db.clientes.get(id), [id])
  const ventas = useLiveQuery(() => db.ventas.where('clienteId').equals(id).toArray(), [id]) || []
  const pagos = useLiveQuery(() => db.pagos.where('clienteId').equals(id).toArray(), [id]) || []
  const [editando, setEditando] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState('efectivo')

  const saldo = calcularSaldos(ventas, pagos)[id] || 0
  const historial = useMemo(
    () =>
      [
        ...ventas.map((v) => ({ tipo: 'venta', fecha: v.fecha, monto: v.total, pagado: v.pagado, id: 'v' + v.id })),
        ...pagos.map((p) => ({ tipo: 'pago', fecha: p.fecha, monto: p.monto, medio: p.medioPago, id: 'p' + p.id, pagoId: p.id })),
      ].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [ventas, pagos],
  )
  const totalComprado = ventas.reduce((s, v) => s + v.total, 0)

  async function registrarPago() {
    const m = numero(monto)
    if (m <= 0) return toast('Poné el monto')
    await db.pagos.add({ fecha: new Date().toISOString(), clienteId: id, monto: m, medioPago: medio })
    setCobrando(false)
    setMonto('')
    toast(`Pago de ${$(m)} registrado`)
  }

  async function borrarPago(pagoId) {
    if (confirm('¿Borrar este pago?')) await db.pagos.delete(pagoId)
  }

  async function eliminar() {
    if (ventas.length) return alert('Este cliente tiene ventas registradas, no se puede eliminar.')
    if (!confirm('¿Eliminar cliente?')) return
    await db.clientes.delete(id)
    navegar('/clientes')
  }

  if (cliente === undefined) return null
  if (!cliente) return <p>Cliente no encontrado. <Link to="/clientes">Volver</Link></p>

  return (
    <>
      <div className="tarjeta">
        <h2 style={{ fontSize: '1.2rem' }}>{cliente.nombre}</h2>
        {cliente.direccion && <div className="muted">📍 {cliente.direccion}</div>}
        {cliente.telefono && <div className="muted">📱 {cliente.telefono}</div>}
        {cliente.notas && <div className="muted" style={{ marginTop: 6 }}>{cliente.notas}</div>}
        <div className="botones" style={{ marginTop: 12 }}>
          {cliente.telefono && <a className="boton verde" href={linkWhatsApp(cliente.telefono)} target="_blank" rel="noreferrer">WhatsApp</a>}
          <button className="boton" onClick={() => setEditando(true)}>Editar</button>
        </div>
      </div>

      <div className="grilla" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="dato">
          <div className="etiqueta">Debe</div>
          <div className={`valor ${saldo > 0 ? 'baja' : ''}`}>{$(Math.max(saldo, 0))}</div>
          {saldo < 0 && <div className="comparacion sube">A favor: {$(-saldo)}</div>}
        </div>
        <div className="dato">
          <div className="etiqueta">Compró en total</div>
          <div className="valor">{$(totalComprado)}</div>
          <div className="comparacion muted">{ventas.length} compras</div>
        </div>
      </div>

      <div className="botones" style={{ marginBottom: 12 }}>
        <button className="boton primario" onClick={() => setCobrando(true)}>💵 Registrar pago</button>
        {saldo > 0 && cliente.telefono && (
          <a
            className="boton"
            target="_blank"
            rel="noreferrer"
            href={linkWhatsApp(cliente.telefono, `Hola ${cliente.nombre}! Te recuerdo que quedó un saldo pendiente de ${$(saldo)}. Gracias!`)}
          >
            Recordar deuda
          </a>
        )}
      </div>

      <div className="tarjeta">
        <h2>Movimientos</h2>
        {historial.length === 0 && <div className="muted">Sin movimientos todavía.</div>}
        <ul className="lista">
          {historial.map((h) => (
            <li key={h.id}>
              <div className="principal-item">
                <div className="titulo">{h.tipo === 'venta' ? 'Compra' : `Pago (${MEDIOS[h.medio] || h.medio})`}</div>
                <div className="sub">
                  {fecha(h.fecha)}
                  {h.tipo === 'venta' && h.monto - h.pagado > 0 && ` · quedó debiendo ${$(h.monto - h.pagado)}`}
                </div>
              </div>
              <div className={`monto ${h.tipo === 'pago' ? 'sube' : ''}`}>{h.tipo === 'pago' ? '+' : ''}{$(h.monto)}</div>
              {h.tipo === 'pago' && <button className="boton chico peligro" onClick={() => borrarPago(h.pagoId)} aria-label="Borrar pago">✕</button>}
            </li>
          ))}
        </ul>
      </div>
      <button className="boton peligro chico" onClick={eliminar}>Eliminar cliente</button>

      {editando && <FormCliente cliente={cliente} onCerrar={() => setEditando(false)} />}
      {cobrando && (
        <Modal titulo={`Pago de ${cliente.nombre}`} onCerrar={() => setCobrando(false)}>
          <Campo label="Monto"><input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={saldo > 0 ? String(saldo) : ''} autoFocus /></Campo>
          <Campo label="Medio de pago">
            <select value={medio} onChange={(e) => setMedio(e.target.value)}>
              {Object.entries(MEDIOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </Campo>
          <div className="botones">
            <button className="boton" onClick={() => setCobrando(false)}>Cancelar</button>
            <button className="boton primario" onClick={registrarPago}>Registrar</button>
          </div>
        </Modal>
      )}
    </>
  )
}
