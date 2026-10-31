import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { calcularSaldos, db } from '../lib/db'
import { $, normalizar } from '../lib/format'
import { Campo, Modal, Vacio, useToast } from '../components/ui'

export function FormCliente({ cliente, onCerrar }) {
  const [f, setF] = useState(cliente || { nombre: '', telefono: '', direccion: '', notas: '' })
  const toast = useToast()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function guardar() {
    if (!f.nombre.trim()) return toast('Poné un nombre')
    const datos = { nombre: f.nombre.trim(), telefono: f.telefono.trim(), direccion: f.direccion.trim(), notas: f.notas }
    if (cliente?.id) await db.clientes.update(cliente.id, datos)
    else await db.clientes.add(datos)
    toast('Cliente guardado')
    onCerrar()
  }
  return (
    <Modal titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'} onCerrar={onCerrar}>
      <Campo label="Nombre o negocio"><input value={f.nombre} onChange={set('nombre')} autoFocus /></Campo>
      <Campo label="WhatsApp (con código de área, ej: 11 2345 6789)"><input inputMode="tel" value={f.telefono} onChange={set('telefono')} /></Campo>
      <Campo label="Dirección o zona"><input value={f.direccion} onChange={set('direccion')} /></Campo>
      <Campo label="Notas"><textarea rows={2} value={f.notas} onChange={set('notas')} /></Campo>
      <div className="botones">
        <button className="boton" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}

export default function Clientes() {
  const clientes = useLiveQuery(() => db.clientes.orderBy('nombre').toArray(), [])
  const ventas = useLiveQuery(() => db.ventas.toArray(), []) || []
  const pagos = useLiveQuery(() => db.pagos.toArray(), []) || []
  const [busqueda, setBusqueda] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [soloDeudores, setSoloDeudores] = useState(false)
  const navegar = useNavigate()

  const saldos = useMemo(() => calcularSaldos(ventas, pagos), [ventas, pagos])
  const totalDeuda = Object.values(saldos).reduce((s, v) => s + Math.max(v, 0), 0)
  const filtrados = (clientes || []).filter(
    (c) => normalizar(c.nombre).includes(normalizar(busqueda)) && (!soloDeudores || (saldos[c.id] || 0) > 0),
  )

  return (
    <>
      <button className="boton primario ancho" style={{ marginBottom: 12 }} onClick={() => setNuevo(true)}>+ Nuevo cliente</button>
      <input className="buscador" placeholder="🔍 Buscar cliente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={soloDeudores} onChange={(e) => setSoloDeudores(e.target.checked)} />
          Solo los que deben
        </label>
        <span className="muted">Te deben en total: <b>{$(totalDeuda)}</b></span>
      </div>
      {clientes && clientes.length === 0 && <Vacio>Todavía no cargaste clientes.</Vacio>}
      {filtrados.length > 0 && (
        <div className="tarjeta">
          <ul className="lista">
            {filtrados.map((c) => {
              const saldo = saldos[c.id] || 0
              return (
                <li key={c.id} className="clickeable" onClick={() => navegar(`/clientes/${c.id}`)}>
                  <div className="principal-item">
                    <div className="titulo">{c.nombre}</div>
                    <div className="sub">{c.direccion || c.telefono || ' '}</div>
                  </div>
                  {saldo > 0 ? <span className="chip rojo">Debe {$(saldo)}</span> : <span className="chip verde">Al día</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {nuevo && <FormCliente onCerrar={() => setNuevo(false)} />}
    </>
  )
}
