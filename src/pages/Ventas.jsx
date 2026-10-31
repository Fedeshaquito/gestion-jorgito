import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { anularVenta, db } from '../lib/db'
import { $, fecha, fechaHora, inicioDia } from '../lib/format'
import { Modal, Vacio, useToast } from '../components/ui'
import { MEDIOS } from './NuevaVenta'

export default function Ventas() {
  const ventas = useLiveQuery(() => db.ventas.orderBy('fecha').reverse().toArray(), [])
  const [detalle, setDetalle] = useState(null)
  const toast = useToast()

  const porDia = useMemo(() => {
    const grupos = []
    for (const v of ventas || []) {
      const dia = inicioDia(new Date(v.fecha)).toISOString()
      let g = grupos.at(-1)
      if (!g || g.dia !== dia) grupos.push((g = { dia, ventas: [], total: 0 }))
      g.ventas.push(v)
      g.total += v.total
    }
    return grupos
  }, [ventas])

  async function anular(v) {
    if (!confirm('¿Anular esta venta? El stock vuelve a sumarse.')) return
    await anularVenta(v.id)
    setDetalle(null)
    toast('Venta anulada')
  }

  return (
    <>
      <Link to="/vender" className="boton primario ancho" style={{ marginBottom: 14 }}>+ Nueva venta</Link>
      {ventas && ventas.length === 0 && <Vacio>Todavía no hay ventas registradas.</Vacio>}
      {porDia.map((g) => (
        <div key={g.dia} className="tarjeta">
          <h2 style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{fecha(g.dia)}</span>
            <span>{$(g.total)}</span>
          </h2>
          <ul className="lista">
            {g.ventas.map((v) => {
              const debe = v.total - (v.pagado || 0)
              return (
                <li key={v.id} className="clickeable" onClick={() => setDetalle(v)}>
                  <div className="principal-item">
                    <div className="titulo">{v.clienteNombre || 'Venta al paso'}</div>
                    <div className="sub">
                      {new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {v.items.reduce((s, i) => s + i.cantidad, 0)} unid.{' '}
                      {debe > 0 && <span className="chip rojo">Debe {$(debe)}</span>}
                    </div>
                  </div>
                  <div className="monto">{$(v.total)}</div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {detalle && (
        <Modal titulo={`Venta del ${fechaHora(detalle.fecha)}`} onCerrar={() => setDetalle(null)}>
          <p><b>Cliente:</b> {detalle.clienteNombre || 'Venta al paso'}</p>
          <ul className="lista">
            {detalle.items.map((i, n) => (
              <li key={n}>
                <div className="principal-item">
                  <div className="titulo">{i.nombre}</div>
                  <div className="sub">{i.cantidad} × {$(i.precio)}</div>
                </div>
                <div className="monto">{$(i.cantidad * i.precio)}</div>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: '1.1rem' }}><b>Total: {$(detalle.total)}</b></p>
          <p className="muted">
            Pagó {$(detalle.pagado)} {detalle.pagado > 0 && `(${MEDIOS[detalle.medioPago] || detalle.medioPago})`}
            {detalle.total - detalle.pagado > 0 && ` · Quedó debiendo ${$(detalle.total - detalle.pagado)}`}
          </p>
          <div className="botones">
            <button className="boton peligro" onClick={() => anular(detalle)}>Anular venta</button>
            <button className="boton" onClick={() => setDetalle(null)}>Cerrar</button>
          </div>
        </Modal>
      )}
    </>
  )
}
