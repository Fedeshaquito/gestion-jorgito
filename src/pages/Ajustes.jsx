import { useEffect, useState } from 'react'
import { exportarTodo, getConfig, importarTodo, setConfig } from '../lib/db'
import { Campo, useToast } from '../components/ui'
import { achicarImagen } from '../lib/imagen'
import { crearCuenta, ingresar, salir, sincronizar, syncDisponible, useSync } from '../lib/sync'

function Nube() {
  const s = useSync()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  if (!syncDisponible) {
    return (
      <div className="tarjeta">
        <h2>☁️ Respaldo en la nube</h2>
        <p className="muted" style={{ margin: 0 }}>Todavía no está activado.</p>
      </div>
    )
  }

  async function hacer(fn) {
    setOcupado(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!s.usuario) {
    return (
      <div className="tarjeta">
        <h2>☁️ Respaldo en la nube</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Ingresá con tu cuenta para guardar todo en la nube y usar la app en el celular y en la compu con los mismos datos.
        </p>
        <Campo label="Mail"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <Campo label="Contraseña"><input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} /></Campo>
        {error && <div className="aviso">{error}</div>}
        <div className="botones">
          <button className="boton primario" disabled={ocupado} onClick={() => hacer(async () => { await ingresar(email.trim(), clave); toast('Sesión iniciada') })}>Ingresar</button>
          <button className="boton" disabled={ocupado} onClick={() => hacer(async () => { await crearCuenta(email.trim(), clave); toast('Cuenta creada') })}>Crear cuenta</button>
        </div>
      </div>
    )
  }

  const textos = {
    sincronizando: 'Sincronizando…',
    ok: 'Todo guardado en la nube ✅',
    'sin-conexion': 'Sin internet. Los cambios se suben solos cuando vuelva la conexión.',
    error: `No se pudo sincronizar: ${s.error}`,
  }
  return (
    <div className="tarjeta">
      <h2>☁️ Respaldo en la nube</h2>
      <p style={{ marginTop: 0 }}>{textos[s.fase] || ''}</p>
      <p className="muted">
        Cuenta: {s.usuario.email}
        {s.ultima && <> · Última vez: {new Date(s.ultima).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>}
      </p>
      <div className="botones">
        <button className="boton" onClick={() => sincronizar()}>🔄 Sincronizar ahora</button>
        <button className="boton peligro" onClick={() => confirm('¿Cerrar sesión en este dispositivo? Los datos quedan guardados.') && salir()}>Cerrar sesión</button>
      </div>
    </div>
  )
}

export default function Ajustes() {
  const [cfg, setCfg] = useState(null)
  const toast = useToast()

  useEffect(() => {
    getConfig().then(setCfg)
  }, [])

  if (!cfg) return null
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value })

  async function guardar() {
    for (const k of ['negocioNombre', 'negocioTelefono', 'negocioDireccion', 'pieTexto']) await setConfig(k, cfg[k] || '')
    toast('Datos guardados')
  }

  async function cambiarLogo(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    const logo = await achicarImagen(archivo, 600, 'image/png')
    await setConfig('logo', logo)
    setCfg({ ...cfg, logo })
    toast('Logo actualizado')
  }

  async function descargarCopia() {
    const datos = await exportarTodo()
    const blob = new Blob([JSON.stringify(datos)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `copia-gestion-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    await setConfig('ultimaCopia', new Date().toISOString())
    toast('Copia descargada')
  }

  async function restaurar(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    if (!confirm('Esto reemplaza TODOS los datos actuales por los de la copia. ¿Seguir?')) return
    try {
      await importarTodo(JSON.parse(await archivo.text()))
      toast('Datos restaurados')
      setCfg(await getConfig())
    } catch (err) {
      alert('No se pudo restaurar: ' + err.message)
    }
  }

  return (
    <>
      <Nube />
      <div className="tarjeta">
        <h2>Datos del negocio (salen en los presupuestos)</h2>
        <Campo label="Nombre del negocio"><input value={cfg.negocioNombre || ''} onChange={set('negocioNombre')} /></Campo>
        <Campo label="Teléfono / WhatsApp"><input value={cfg.negocioTelefono || ''} onChange={set('negocioTelefono')} /></Campo>
        <Campo label="Dirección o zona"><input value={cfg.negocioDireccion || ''} onChange={set('negocioDireccion')} /></Campo>
        <Campo label="Texto al pie del presupuesto">
          <textarea rows={2} value={cfg.pieTexto || ''} onChange={set('pieTexto')} placeholder="Ej: Precios válidos por 7 días. Gracias por su compra." />
        </Campo>
        <button className="boton primario ancho" onClick={guardar}>Guardar</button>
      </div>

      <div className="tarjeta">
        <h2>Logo</h2>
        {cfg.logo && <img src={cfg.logo} alt="Logo" style={{ maxHeight: 80, maxWidth: '100%', display: 'block', marginBottom: 10 }} />}
        <input type="file" accept="image/*" onChange={cambiarLogo} />
      </div>

      <div className="tarjeta">
        <h2>Copia de seguridad</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Además de la nube, podés descargar una copia en un archivo y guardarla donde quieras.
          {cfg.ultimaCopia && <> Última copia: {new Date(cfg.ultimaCopia).toLocaleDateString('es-AR')}.</>}
        </p>
        <div className="botones">
          <button className="boton" onClick={descargarCopia}>⬇️ Descargar copia</button>
          <label className="boton">
            ⬆️ Restaurar copia
            <input type="file" accept="application/json,.json" onChange={restaurar} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
    </>
  )
}
