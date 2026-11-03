import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ajustarStock, aumentarPrecios, crearProducto, db, ingresarMercaderia } from '../lib/db'
import { $, normalizar } from '../lib/format'
import { Campo, Modal, Vacio, numero, useToast } from '../components/ui'
import { achicarImagen } from '../lib/imagen'

const VACIO = { nombre: '', codigo: '', categoria: '', costo: '', precio: '', stock: '', stockMinimo: '', unidadesPorBulto: '', precioBulto: '', foto: '' }

function FormProducto({ producto, categorias, onCerrar, onReponer }) {
  const [f, setF] = useState(producto ? { ...VACIO, ...producto } : VACIO)
  const toast = useToast()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const margen = numero(f.costo) > 0 ? Math.round(((numero(f.precio) - numero(f.costo)) / numero(f.costo)) * 100) : null

  async function guardar() {
    if (!f.nombre.trim()) return toast('Poné un nombre')
    const datos = {
      nombre: f.nombre.trim(),
      codigo: f.codigo.trim(),
      categoria: f.categoria.trim(),
      costo: numero(f.costo),
      precio: numero(f.precio),
      stockMinimo: numero(f.stockMinimo),
      unidadesPorBulto: numero(f.unidadesPorBulto) > 1 ? numero(f.unidadesPorBulto) : 0,
      precioBulto: numero(f.unidadesPorBulto) > 1 ? numero(f.precioBulto) : 0,
      foto: f.foto || '',
      activo: true,
    }
    if (producto?.id) await db.productos.update(producto.id, datos)
    else await crearProducto(datos, numero(f.stock))
    toast('Producto guardado')
    onCerrar()
  }

  async function eliminar() {
    if (!confirm('¿Eliminar este producto? Las ventas anteriores no se modifican.')) return
    await db.productos.delete(producto.id)
    onCerrar()
  }

  return (
    <Modal titulo={producto ? 'Editar producto' : 'Nuevo producto'} onCerrar={onCerrar}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label className="foto-producto">
          {f.foto ? <img src={f.foto} alt="" /> : <span>📷<br />Foto</span>}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const a = e.target.files?.[0]
              if (a) setF({ ...f, foto: await achicarImagen(a) })
            }}
          />
        </label>
        <div style={{ flex: 1 }}>
          <Campo label="Nombre"><input value={f.nombre} onChange={set('nombre')} autoFocus /></Campo>
          {f.foto && <button className="boton chico" onClick={() => setF({ ...f, foto: '' })}>Quitar foto</button>}
        </div>
      </div>
      <div className="fila">
        <Campo label="Categoría">
          <input list="categorias" value={f.categoria} onChange={set('categoria')} placeholder="Ej: Golosinas" />
          <datalist id="categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </Campo>
        <Campo label="Código (opcional)"><input value={f.codigo} onChange={set('codigo')} /></Campo>
      </div>
      <div className="fila">
        <Campo label="Costo por unidad"><input inputMode="decimal" value={f.costo} onChange={set('costo')} /></Campo>
        <Campo label="Precio por unidad"><input inputMode="decimal" value={f.precio} onChange={set('precio')} /></Campo>
      </div>
      {margen !== null && <p className="muted" style={{ marginTop: -6 }}>Ganancia: {$(numero(f.precio) - numero(f.costo))} por unidad ({margen}%)</p>}
      <div className="fila">
        <Campo label="Unidades por bulto (opcional)"><input inputMode="numeric" value={f.unidadesPorBulto} onChange={set('unidadesPorBulto')} placeholder="Ej: 12" /></Campo>
        <Campo label="Precio por bulto">
          <input
            inputMode="decimal"
            value={f.precioBulto}
            onChange={set('precioBulto')}
            disabled={numero(f.unidadesPorBulto) <= 1}
            placeholder={numero(f.unidadesPorBulto) > 1 ? String(numero(f.precio) * numero(f.unidadesPorBulto)) : ''}
          />
        </Campo>
      </div>
      {producto && (
        <div className="tarjeta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span>Stock actual: <b>{producto.stock ?? 0} unidades</b></span>
          <button className="boton primario chico" onClick={onReponer}>📦 Reponer stock</button>
        </div>
      )}
      <div className="fila">
        {!producto && <Campo label="Stock actual (unidades)"><input inputMode="numeric" value={f.stock} onChange={set('stock')} /></Campo>}
        <Campo label="Avisar cuando queden menos de"><input inputMode="numeric" value={f.stockMinimo} onChange={set('stockMinimo')} /></Campo>
      </div>
      <div className="botones">
        {producto && <button className="boton peligro" onClick={eliminar}>Eliminar</button>}
        <button className="boton" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}

function FormStock({ producto, onCerrar }) {
  const [modo, setModo] = useState('compra')
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState(producto.costo || '')
  const [nuevoStock, setNuevoStock] = useState(producto.stock ?? 0)
  const toast = useToast()

  async function guardar() {
    if (modo === 'compra') {
      if (numero(cantidad) <= 0) return toast('Poné la cantidad que entró')
      await ingresarMercaderia({ productoId: producto.id, cantidad: numero(cantidad), costoUnit: numero(costo) })
    } else {
      await ajustarStock({ productoId: producto.id, nuevoStock: numero(nuevoStock), nota: 'Ajuste manual' })
    }
    toast('Stock actualizado')
    onCerrar()
  }

  return (
    <Modal titulo={producto.nombre} onCerrar={onCerrar}>
      <p className="muted" style={{ marginTop: -8 }}>Stock actual: <b>{producto.stock ?? 0} unidades</b>{producto.unidadesPorBulto > 1 && ` (${Math.floor((producto.stock ?? 0) / producto.unidadesPorBulto)} bultos)`}</p>
      <div className="botones" style={{ marginBottom: 12 }}>
        <button className={`boton chico ${modo === 'compra' ? 'primario' : ''}`} onClick={() => setModo('compra')}>Entró mercadería</button>
        <button className={`boton chico ${modo === 'ajuste' ? 'primario' : ''}`} onClick={() => setModo('ajuste')}>Corregir stock</button>
      </div>
      {modo === 'compra' ? (
        <div className="fila">
          <Campo label="Unidades que entraron"><input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus /></Campo>
          <Campo label="Costo por unidad"><input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} /></Campo>
        </div>
      ) : (
        <Campo label="Stock real (contado)"><input inputMode="numeric" value={nuevoStock} onChange={(e) => setNuevoStock(e.target.value)} autoFocus /></Campo>
      )}
      <div className="botones">
        <button className="boton" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}

function FormAumento({ categorias, onCerrar }) {
  const [porcentaje, setPorcentaje] = useState('')
  const [categoria, setCategoria] = useState('')
  const [redondeo, setRedondeo] = useState('10')
  const toast = useToast()

  async function aplicar() {
    const pct = numero(porcentaje)
    if (!pct) return toast('Poné un porcentaje')
    const alcance = categoria ? `los productos de "${categoria}"` : 'todos los productos'
    if (!confirm(`¿Subir ${pct}% el precio de ${alcance}?`)) return
    const n = await aumentarPrecios({ porcentaje: pct, categoria, redondeo: numero(redondeo) })
    toast(`Precios actualizados (${n} productos)`)
    onCerrar()
  }

  return (
    <Modal titulo="Actualizar precios" onCerrar={onCerrar}>
      <Campo label="Porcentaje de aumento (usá negativo para bajar)"><input inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} placeholder="Ej: 8" autoFocus /></Campo>
      <Campo label="¿A qué productos?">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todos</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Campo>
      <Campo label="Redondear precios a">
        <select value={redondeo} onChange={(e) => setRedondeo(e.target.value)}>
          <option value="1">Sin redondear</option>
          <option value="10">$10</option>
          <option value="50">$50</option>
          <option value="100">$100</option>
        </select>
      </Campo>
      <div className="botones">
        <button className="boton" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={aplicar}>Aplicar</button>
      </div>
    </Modal>
  )
}

function FormImportar({ onCerrar }) {
  const [texto, setTexto] = useState('')
  const toast = useToast()
  const filas = texto
    .split('\n')
    .map((l) => l.split(/[;\t]/).map((c) => c.trim()))
    .filter((c) => c[0] && !/^nombre$/i.test(c[0]))

  async function importar() {
    if (!filas.length) return
    const plata = (v) => numero((v || '').replace(/\$|\s/g, '').replace(/\./g, ''))
    for (const [nombre, precio, costo, stock, categoria, porBulto, precioBulto] of filas) {
      const upb = numero(porBulto)
      await crearProducto(
        {
          nombre,
          precio: plata(precio),
          costo: plata(costo),
          categoria: categoria || '',
          codigo: '',
          stockMinimo: 0,
          unidadesPorBulto: upb > 1 ? upb : 0,
          precioBulto: upb > 1 ? plata(precioBulto) : 0,
          activo: true,
        },
        numero(stock),
      )
    }
    toast(`${filas.length} productos cargados`)
    onCerrar()
  }

  return (
    <Modal titulo="Cargar muchos productos" onCerrar={onCerrar}>
      <p className="muted" style={{ marginTop: -8 }}>
        Pegá una lista desde Excel con las columnas en este orden: <b>nombre, precio, costo, stock, categoría</b> y, si vende por bulto, <b>unidades por bulto, precio del bulto</b>. Una fila por producto.
      </p>
      <textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'Alfajor Jorgito x6\t2500\t1800\t40\tGolosinas'} />
      <p className="muted">{filas.length} productos detectados</p>
      <div className="botones">
        <button className="boton" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" disabled={!filas.length} onClick={importar}>Cargar</button>
      </div>
    </Modal>
  )
}

function FormCatalogo({ categorias, productos, onCerrar }) {
  const [categoria, setCategoria] = useState('')
  const [conPrecios, setConPrecios] = useState(true)
  const [soloConStock, setSoloConStock] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  const elegidos = productos.filter(
    (p) => p.activo !== false && (!categoria || p.categoria === categoria) && (!soloConStock || (p.stock ?? 0) > 0),
  )

  async function generar(compartir) {
    if (!elegidos.length) return toast('No hay productos para mostrar')
    setOcupado(true)
    try {
      const { compartirCatalogo, descargarCatalogo } = await import('../lib/catalogo')
      const { getConfig } = await import('../lib/db')
      const opciones = { productos: elegidos, categoria, conPrecios, config: await getConfig() }
      if (compartir) {
        const r = await compartirCatalogo(opciones)
        if (r === 'descargado') toast('PDF descargado. Adjuntalo en WhatsApp.')
      } else await descargarCatalogo(opciones)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Modal titulo="Catálogo para clientes" onCerrar={onCerrar}>
      <p className="muted" style={{ marginTop: -8 }}>Arma un PDF con las fotos, nombres y precios actualizados, listo para mandar por WhatsApp.</p>
      <Campo label="¿Qué productos?">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todos</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Campo>
      <label className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={conPrecios} onChange={(e) => setConPrecios(e.target.checked)} /> Mostrar precios
      </label>
      <label className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} /> Solo productos con stock
      </label>
      <p className="muted">{elegidos.length} productos</p>
      <div className="botones">
        <button className="boton" disabled={ocupado} onClick={() => generar(false)}>⬇️ Descargar</button>
        <button className="boton verde" disabled={ocupado} onClick={() => generar(true)}>📲 Enviar</button>
      </div>
    </Modal>
  )
}

export default function Productos() {
  const productos = useLiveQuery(() => db.productos.orderBy('nombre').toArray(), [])
  const [busqueda, setBusqueda] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)
  const [editando, setEditando] = useState(null) // null | 'nuevo' | producto
  const [stockDe, setStockDe] = useState(null)
  const [aumento, setAumento] = useState(false)
  const [importar, setImportar] = useState(false)
  const [catalogo, setCatalogo] = useState(false)

  const categorias = useMemo(() => [...new Set((productos || []).map((p) => p.categoria).filter(Boolean))].sort(), [productos])
  const esBajo = (p) => (p.stock ?? 0) <= (p.stockMinimo || 0)
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda)
    return (productos || []).filter(
      (p) =>
        (!q || normalizar(p.nombre).includes(q) || normalizar(p.categoria).includes(q) || normalizar(p.codigo).includes(q)) &&
        (!soloBajo || esBajo(p)),
    )
  }, [productos, busqueda, soloBajo])
  const valorStock = (productos || []).reduce((s, p) => s + Math.max(p.stock || 0, 0) * (p.costo || 0), 0)

  return (
    <>
      <div className="botones" style={{ marginBottom: 12 }}>
        <button className="boton primario" onClick={() => setEditando('nuevo')}>+ Producto</button>
        <button className="boton" onClick={() => setAumento(true)}>📈 Subir precios</button>
        <button className="boton" onClick={() => setImportar(true)}>📋 Cargar lista</button>
        <button className="boton" onClick={() => setCatalogo(true)}>📕 Catálogo</button>
      </div>
      <input className="buscador" placeholder="🔍 Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} />
          Solo stock bajo
        </label>
        <span className="muted">Mercadería en stock: <b>{$(valorStock)}</b></span>
      </div>

      {productos && productos.length === 0 && <Vacio>Cargá tus productos para empezar. Podés pegar una lista desde Excel con “Cargar lista”.</Vacio>}
      {filtrados.length > 0 && (
        <div className="tarjeta">
          <ul className="lista">
            {filtrados.map((p) => (
              <li key={p.id}>
                {p.foto ? <img src={p.foto} alt="" className="miniatura" onClick={() => setEditando(p)} /> : <div className="miniatura vacia" onClick={() => setEditando(p)}>📦</div>}
                <div className="principal-item clickeable" onClick={() => setEditando(p)}>
                  <div className="titulo">{p.nombre}</div>
                  <div className="sub">
                    {$(p.precio)}
                    {p.unidadesPorBulto > 1 && ` · bulto x${p.unidadesPorBulto} ${$(p.precioBulto || p.precio * p.unidadesPorBulto)}`}
                    {p.categoria && ` · ${p.categoria}`}
                  </div>
                </div>
                <button className={`chip ${esBajo(p) ? 'rojo' : 'verde'}`} style={{ border: 0, cursor: 'pointer', padding: '6px 10px' }} onClick={() => setStockDe(p)}>
                  Stock {p.stock ?? 0} ＋
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editando && (
        <FormProducto
          producto={editando === 'nuevo' ? null : editando}
          categorias={categorias}
          onCerrar={() => setEditando(null)}
          onReponer={() => {
            setStockDe(editando)
            setEditando(null)
          }}
        />
      )}
      {stockDe && <FormStock producto={stockDe} onCerrar={() => setStockDe(null)} />}
      {aumento && <FormAumento categorias={categorias} onCerrar={() => setAumento(false)} />}
      {importar && <FormImportar onCerrar={() => setImportar(false)} />}
      {catalogo && <FormCatalogo categorias={categorias} productos={productos || []} onCerrar={() => setCatalogo(false)} />}
    </>
  )
}
