const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
export const $ = (n) => moneda.format(Math.round(Number(n) || 0))

export const fecha = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export const inicioDia = (d = new Date()) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// Semana que empieza el lunes
export const inicioSemana = (d = new Date()) => {
  const x = inicioDia(d)
  const dia = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - dia)
  return x
}

export const inicioMes = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1)

export const normalizar = (s) =>
  (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export const soloDigitos = (s) => (s || '').replace(/\D/g, '')

// Arma el link de WhatsApp. Si el número es argentino sin código de país, lo agrega.
export function linkWhatsApp(telefono, texto) {
  let num = soloDigitos(telefono)
  if (num && !num.startsWith('54')) {
    num = num.replace(/^0/, '')
    num = '549' + num
  }
  const base = num ? `https://wa.me/${num}` : 'https://wa.me/'
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base
}
