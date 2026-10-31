import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { $, fecha } from '../lib/format'
import { Vacio } from '../components/ui'

export default function Presupuestos() {
  const lista = useLiveQuery(() => db.presupuestos.orderBy('numero').reverse().toArray(), [])
  const navegar = useNavigate()
  return (
    <>
      <Link to="/presupuestos/nuevo" className="boton primario ancho" style={{ marginBottom: 14 }}>+ Nuevo presupuesto</Link>
      {lista && lista.length === 0 && <Vacio>Todavía no hiciste presupuestos.</Vacio>}
      {lista && lista.length > 0 && (
        <div className="tarjeta">
          <ul className="lista">
            {lista.map((p) => (
              <li key={p.id} className="clickeable" onClick={() => navegar(`/presupuestos/${p.id}`)}>
                <div className="principal-item">
                  <div className="titulo">N° {p.numero} · {p.clienteNombre || 'Sin cliente'}</div>
                  <div className="sub">
                    {fecha(p.fecha)}{' '}
                    {p.estado === 'vendido' ? <span className="chip verde">Vendido</span> : <span className="chip ambar">Pendiente</span>}
                  </div>
                </div>
                <div className="monto">{$(p.total)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
