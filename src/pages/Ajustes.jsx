import { useEffect, useState } from 'react'
import { exportarTodo, getConfig, importarTodo, setConfig } from '../lib/db'
import { Campo, useToast } from '../components/ui'

// Achica el logo para que el PDF no pese de más
function achicarImagen(archivo, max = 600) {
  return new Promise((ok, mal) => {
    const lector = new FileReader()
    lector.onload = () => {
      const img = new Image()
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * escala)
        c.height = Math.round(img.height * escala)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        ok(c.toDataURL('image/png'))
      }
      img.onerror = mal
      img.src = lector.result
    }
    lector.onerror = mal
    lector.readAsDataURL(archivo)
  })
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
    const logo = await achicarImagen(archivo)
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
          Los datos se guardan en este dispositivo. Descargá una copia cada tanto y guardala en Drive o mandatela por WhatsApp.
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
