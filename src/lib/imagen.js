// Achica una foto para que no ocupe mucho (y se sincronice rápido)
export function achicarImagen(archivo, max = 600, formato = 'image/jpeg', calidad = 0.75) {
  return new Promise((ok, mal) => {
    const lector = new FileReader()
    lector.onload = () => {
      const img = new Image()
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * escala)
        c.height = Math.round(img.height * escala)
        const ctx = c.getContext('2d')
        if (formato === 'image/jpeg') {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, c.width, c.height)
        }
        ctx.drawImage(img, 0, 0, c.width, c.height)
        ok(c.toDataURL(formato, calidad))
      }
      img.onerror = mal
      img.src = lector.result
    }
    lector.onerror = mal
    lector.readAsDataURL(archivo)
  })
}
