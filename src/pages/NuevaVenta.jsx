import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, registrarVenta } from '../lib/db'
import { $ } from '../lib/format'
import { EditorItems, SelectorCliente, totalDe } from '../components/Carrito'
import { Campo, numero, useToast } from '../components/ui'

export const MEDIOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'Mercado Pago' }

export default function NuevaVenta() {
  const [params] = useSearchParams()
  const presupuestoId = Number(params.get('presupuesto')) || null
  const navegar = useNavigate()
  const toast = useToast()
  const [cliente, setCliente] = useState(null)
  const [items, setItems] = useState([])
  const [medioPago, setMedioPago] = useState('efectivo')
  const [modoPago, setModoPago] = useState('total')
  const [montoParcial, setMontoParcial] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!presupuestoId) return
    ;(async () => {
      const p = await db.presupuestos.get(presupuestoId)
      if (!p) return
      setItems(p.items.map((i) => ({ ...i })))
      if (p.clienteId) setCliente(await db.clientes.get(p.clienteId))
    })()
  }, [presupuestoId])

  const total = totalDe(items)
  const pagado = modoPago === 'total' ? total : modoPago === 'fiado' ? 0 : Math.min(numero(montoParcial), total)
  const necesitaCliente = modoPago !== 'total' && !cliente

  async function confirmar() {
    if (!items.length || total <= 0 || necesitaCliente) return
    setGuardando(true)
    await registrarVenta({ cliente, items, pagado, medioPago, presupuestoId })
    toast(`Venta registrada: ${$(total)}`)
    navegar('/ventas')
  }

  return (
    <>
      <SelectorCliente cliente={cliente} onCambiar={setCliente} />
      <EditorItems items={items} onCambiar={setItems} />

      <div className="tarjeta">
        <h2>Pago</h2>
        <div className="botones" style={{ marginBottom: 12 }}>
          {[
            ['total', 'Pagó todo'],
            ['parcial', 'Pagó una parte'],
            ['fiado', 'Queda debiendo'],
          ].map(([k, t]) => (
            <button key={k} className={`boton chico ${modoPago === k ? 'primario' : ''}`} onClick={() => setModoPago(k)}>
              {t}
            </button>
          ))}
        </div>
        {modoPago === 'parcial' && (
          <Campo label="¿Cuánto pagó?">
            <input inputMode="decimal" value={montoParcial} onChange={(e) => setMontoParcial(e.target.value)} placeholder="0" />
          </Campo>
        )}
        {modoPago !== 'fiado' && (
          <Campo label="Medio de pago">
            <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
              {Object.entries(MEDIOS).map(([k, t]) => (
                <option key={k} value={k}>{t}</option>
              ))}
            </select>
          </Campo>
        )}
        {necesitaCliente && <div className="aviso">Para dejar saldo pendiente elegí un cliente arriba.</div>}
        {modoPago !== 'total' && cliente && total > 0 && (
          <div className="muted">Le queda debiendo {$(total - pagado)}.</div>
        )}
      </div>

      <div className="total-barra">
        <div>
          <div className="muted" style={{ color: '#d1d5db' }}>Total</div>
          <div className="valor">{$(total)}</div>
        </div>
        <button className="boton verde" disabled={!items.length || total <= 0 || necesitaCliente || guardando} onClick={confirmar}>
          ✓ Confirmar venta
        </button>
      </div>
    </>
  )
}
