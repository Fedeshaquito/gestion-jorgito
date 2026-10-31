import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { calcularSaldos, db, gananciaItem } from '../lib/db'
import { $, inicioDia, inicioMes, inicioSemana } from '../lib/format'
import logo from '../assets/logo-mayorista-jt.png'

const sumar = (ventas, desde, hasta) =>
  ventas.filter((v) => {
    const f = new Date(v.fecha)
    return f >= desde && f < hasta
  })

const total = (vs) => vs.reduce((s, v) => s + v.total, 0)
const ganancia = (vs) => vs.reduce((s, v) => s + v.items.reduce((g, i) => g + gananciaItem(i), 0), 0)

function Comparacion({ actual, anterior, texto }) {
  if (!anterior) return <div className="comparacion muted">{texto}: sin datos</div>
  const pct = Math.round(((actual - anterior) / anterior) * 100)
  return (
    <div className={`comparacion ${pct >= 0 ? 'sube' : 'baja'}`}>
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs {texto}
    </div>
  )
}

export default function Inicio() {
  const ventas = useLiveQuery(() => db.ventas.toArray(), [])
  const pagos = useLiveQuery(() => db.pagos.toArray(), []) || []
  const productos = useLiveQuery(() => db.productos.toArray(), []) || []
  const movimientos = useLiveQuery(() => db.movimientos.where('tipo').equals('compra').toArray(), []) || []

  const d = useMemo(() => {
    const vs = ventas || []
    const ahora = new Date()
    const manana = new Date(inicioDia(ahora).getTime() + 86400000)
    const hoy = inicioDia(ahora)
    const ayer = new Date(hoy.getTime() - 86400000)
    const semana = inicioSemana(ahora)
    const semanaPasada = new Date(semana.getTime() - 7 * 86400000)
    const mismoMomentoSemanaPasada = new Date(ahora.getTime() - 7 * 86400000)
    const mes = inicioMes(ahora)
    const mesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
    const mismoDiaMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, ahora.getDate(), ahora.getHours(), ahora.getMinutes())

    const ventasMes = sumar(vs, mes, manana)

    // últimas 8 semanas
    const semanas = []
    for (let n = 7; n >= 0; n--) {
      const desde = new Date(semana.getTime() - n * 7 * 86400000)
      const hasta = new Date(desde.getTime() + 7 * 86400000)
      semanas.push({ desde, total: total(sumar(vs, desde, hasta)), actual: n === 0 })
    }

    const porProducto = {}
    const porCliente = {}
    for (const v of ventasMes) {
      for (const i of v.items) porProducto[i.nombre] = (porProducto[i.nombre] || 0) + i.cantidad * i.precio
      if (v.clienteNombre) porCliente[v.clienteNombre] = (porCliente[v.clienteNombre] || 0) + v.total
    }
    const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 5)

    const comprasMes = movimientos
      .filter((m) => new Date(m.fecha) >= mes)
      .reduce((s, m) => s + m.cantidad * (m.costoUnit || 0), 0)

    return {
      hoy: total(sumar(vs, hoy, manana)),
      ayer: total(sumar(vs, ayer, hoy)),
      semana: total(sumar(vs, semana, manana)),
      semanaPasada: total(sumar(vs, semanaPasada, mismoMomentoSemanaPasada)),
      mes: total(ventasMes),
      mesPasado: total(sumar(vs, mesPasado, mismoDiaMesPasado)),
      gananciaMes: ganancia(ventasMes),
      cantidadMes: ventasMes.length,
      comprasMes,
      semanas,
      topProductos: top(porProducto),
      topClientes: top(porCliente),
    }
  }, [ventas, movimientos])

  const deuda = Object.values(calcularSaldos(ventas || [], pagos)).reduce((s, v) => s + Math.max(v, 0), 0)
  const stockBajo = productos.filter((p) => p.activo !== false && (p.stock ?? 0) <= (p.stockMinimo || 0))
  const maxSemana = Math.max(...d.semanas.map((s) => s.total), 1)

  if (!ventas) return null

  return (
    <>
      <img src={logo} alt="Mayorista JT" className="logo-inicio" />
      <div className="botones" style={{ marginBottom: 14 }}>
        <Link to="/vender" className="boton primario">🛒 Nueva venta</Link>
        <Link to="/presupuestos/nuevo" className="boton">📄 Presupuesto</Link>
      </div>

      {productos.length === 0 && (
        <div className="aviso">
          👋 Para empezar, cargá tus productos en <Link to="/productos">Productos</Link> y los datos de tu negocio y logo en <Link to="/ajustes">Ajustes</Link>.
        </div>
      )}

      <div className="grilla">
        <div className="dato">
          <div className="etiqueta">Vendido hoy</div>
          <div className="valor">{$(d.hoy)}</div>
          <Comparacion actual={d.hoy} anterior={d.ayer} texto="ayer" />
        </div>
        <div className="dato">
          <div className="etiqueta">Esta semana</div>
          <div className="valor">{$(d.semana)}</div>
          <Comparacion actual={d.semana} anterior={d.semanaPasada} texto="semana pasada" />
        </div>
        <div className="dato">
          <div className="etiqueta">Este mes</div>
          <div className="valor">{$(d.mes)}</div>
          <Comparacion actual={d.mes} anterior={d.mesPasado} texto="mes pasado" />
        </div>
        <div className="dato">
          <div className="etiqueta">Ganancia del mes</div>
          <div className="valor sube">{$(d.gananciaMes)}</div>
          <div className="comparacion muted">{d.cantidadMes} ventas</div>
        </div>
        <div className="dato">
          <div className="etiqueta">Te deben</div>
          <div className={`valor ${deuda > 0 ? 'baja' : ''}`}>{$(deuda)}</div>
          <div className="comparacion"><Link to="/clientes">Ver clientes</Link></div>
        </div>
        <div className="dato">
          <div className="etiqueta">Compraste este mes</div>
          <div className="valor">{$(d.comprasMes)}</div>
          <div className="comparacion muted">mercadería ingresada</div>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Ventas por semana</h2>
        <div className="barras">
          {d.semanas.map((s) => (
            <div key={s.desde.toISOString()} className={`col ${s.actual ? 'actual' : ''}`} title={$(s.total)}>
              <div className="eti">{s.total ? `${Math.round(s.total / 1000)}k` : ''}</div>
              <div className="barra" style={{ height: `${(s.total / maxSemana) * 100}%` }} />
              <div className="eti">{s.desde.getDate()}/{s.desde.getMonth() + 1}</div>
            </div>
          ))}
        </div>
      </div>

      {stockBajo.length > 0 && (
        <div className="tarjeta">
          <h2>⚠️ Stock bajo ({stockBajo.length})</h2>
          <ul className="lista">
            {stockBajo.slice(0, 8).map((p) => (
              <li key={p.id}>
                <div className="principal-item"><div className="titulo">{p.nombre}</div></div>
                <span className="chip rojo">Quedan {p.stock ?? 0}</span>
              </li>
            ))}
          </ul>
          {stockBajo.length > 8 && <Link to="/productos">Ver todos</Link>}
        </div>
      )}

      <div className="grilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div className="tarjeta" style={{ margin: 0 }}>
          <h2>Más vendidos del mes</h2>
          {d.topProductos.length === 0 && <div className="muted">Sin ventas este mes.</div>}
          <ul className="lista">
            {d.topProductos.map(([n, t]) => (
              <li key={n}><div className="principal-item"><div className="titulo">{n}</div></div><div className="monto">{$(t)}</div></li>
            ))}
          </ul>
        </div>
        <div className="tarjeta" style={{ margin: 0 }}>
          <h2>Mejores clientes del mes</h2>
          {d.topClientes.length === 0 && <div className="muted">Sin ventas a clientes este mes.</div>}
          <ul className="lista">
            {d.topClientes.map(([n, t]) => (
              <li key={n}><div className="principal-item"><div className="titulo">{n}</div></div><div className="monto">{$(t)}</div></li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
