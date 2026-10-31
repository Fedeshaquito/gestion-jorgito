import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Inicio from './pages/Inicio.jsx'
import Ventas from './pages/Ventas.jsx'
import NuevaVenta from './pages/NuevaVenta.jsx'
import Presupuestos from './pages/Presupuestos.jsx'
import EditarPresupuesto from './pages/EditarPresupuesto.jsx'
import Productos from './pages/Productos.jsx'
import Clientes from './pages/Clientes.jsx'
import Cliente from './pages/Cliente.jsx'
import Ajustes from './pages/Ajustes.jsx'

const SECCIONES = [
  { to: '/', icono: '🏠', texto: 'Inicio' },
  { to: '/ventas', icono: '🛒', texto: 'Ventas' },
  { to: '/presupuestos', icono: '📄', texto: 'Presupuestos' },
  { to: '/productos', icono: '📦', texto: 'Productos' },
  { to: '/clientes', icono: '👥', texto: 'Clientes' },
]

const TITULOS = {
  '/': 'Inicio',
  '/ventas': 'Ventas',
  '/vender': 'Nueva venta',
  '/presupuestos': 'Presupuestos',
  '/productos': 'Productos',
  '/clientes': 'Clientes',
  '/ajustes': 'Ajustes',
}

function titulo(path) {
  if (TITULOS[path]) return TITULOS[path]
  if (path.startsWith('/presupuestos/')) return 'Presupuesto'
  if (path.startsWith('/clientes/')) return 'Cliente'
  return ''
}

export default function App() {
  const { pathname } = useLocation()
  return (
    <div className="app">
      <nav className="menu">
        {SECCIONES.map((s) => (
          <NavLink key={s.to} to={s.to} end={s.to === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
            <span>{s.icono}</span>
            {s.texto}
          </NavLink>
        ))}
      </nav>
      <div className="principal">
        <header className="cabecera">
          <h1>{titulo(pathname)}</h1>
          <Link to="/ajustes" className="icono" aria-label="Ajustes">⚙️</Link>
        </header>
        <main className="contenido">
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/ventas" element={<Ventas />} />
            <Route path="/vender" element={<NuevaVenta />} />
            <Route path="/presupuestos" element={<Presupuestos />} />
            <Route path="/presupuestos/:id" element={<EditarPresupuesto />} />
            <Route path="/productos" element={<Productos />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id" element={<Cliente />} />
            <Route path="/ajustes" element={<Ajustes />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
