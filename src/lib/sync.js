import { createClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config'
import { TABLAS_SYNC, alCambiarLocal, comoRemoto, db, guardarBorrados, leerBorrados, recalcularStock } from './db'

export const syncDisponible = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
export const supabase = syncDisponible
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

// ---- Estado observable desde React ----
let estado = { fase: syncDisponible ? 'sin-sesion' : 'no-configurado', usuario: null, ultima: localStorage.getItem('mjt-ultima-sync'), error: null }
const subs = new Set()
const set = (cambios) => {
  estado = { ...estado, ...cambios }
  subs.forEach((f) => f())
}
export const useSync = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => estado,
  )

// ---- Sesión ----
export async function ingresar(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw traducir(error)
}

export async function crearCuenta(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw traducir(error)
  if (!data.session) throw new Error('Te mandamos un mail para confirmar la cuenta. Confirmalo y después ingresá.')
}

export async function salir() {
  await supabase.auth.signOut()
  localStorage.removeItem('mjt-ultimo-push')
  localStorage.removeItem('mjt-ultimo-pull')
}

function traducir(error) {
  const m = error.message || ''
  if (/invalid login/i.test(m)) return new Error('Mail o contraseña incorrectos')
  if (/already registered/i.test(m)) return new Error('Ese mail ya tiene cuenta. Usá "Ingresar".')
  if (/at least 6/i.test(m)) return new Error('La contraseña tiene que tener al menos 6 caracteres')
  if (/email not confirmed/i.test(m)) return new Error('Falta confirmar el mail (revisá tu casilla)')
  return new Error(m)
}

// ---- Sincronización ----
let corriendo = false
let pendiente = false

export async function sincronizar() {
  if (!supabase || !estado.usuario) return
  if (!navigator.onLine) return set({ fase: 'sin-conexion' })
  if (corriendo) {
    pendiente = true
    return
  }
  corriendo = true
  set({ fase: 'sincronizando', error: null })
  try {
    await subir()
    await bajar()
    const ahora = new Date().toISOString()
    localStorage.setItem('mjt-ultima-sync', ahora)
    set({ fase: 'ok', ultima: ahora })
  } catch (e) {
    console.error(e)
    set({ fase: 'error', error: e.message || String(e) })
  } finally {
    corriendo = false
    if (pendiente) {
      pendiente = false
      setTimeout(sincronizar, 500)
    }
  }
}

async function subir() {
  const desde = Number(localStorage.getItem('mjt-ultimo-push') || 0)
  const inicio = Date.now()
  const userId = estado.usuario.id
  const filas = []
  for (const t of TABLAS_SYNC) {
    const tabla = db.table(t)
    const cambios = await tabla.where('updatedAt').aboveOrEqual(desde).toArray()
    for (const obj of cambios) {
      const id = String(t === 'config' ? obj.key : obj.id)
      filas.push({ user_id: userId, tabla: t, id, data: obj, borrado: false, actualizado: obj.updatedAt })
    }
  }
  const borrados = leerBorrados()
  for (const b of borrados) {
    const existe = await db.table(b.tabla).get(b.id)
    if (!existe) filas.push({ user_id: userId, tabla: b.tabla, id: b.id, data: null, borrado: true, actualizado: b.t })
  }
  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await supabase.from('registros').upsert(filas.slice(i, i + 200), { onConflict: 'user_id,tabla,id' })
    if (error) throw error
  }
  localStorage.setItem('mjt-ultimo-push', String(inicio))
  // conservar solo los borrados que pasaron mientras subíamos
  guardarBorrados(leerBorrados().filter((b) => b.t >= inicio))
}

async function bajar() {
  let desde = localStorage.getItem('mjt-ultimo-pull') || '1970-01-01T00:00:00Z'
  // un minuto de margen por si dos dispositivos guardaron casi a la vez
  const consulta = new Date(new Date(desde).getTime() - 60000).toISOString()
  const productosTocados = new Set()
  let pagina = 0
  for (;;) {
    const { data, error } = await supabase
      .from('registros')
      .select('tabla,id,data,borrado,actualizado,modificado')
      .gt('modificado', consulta)
      .order('modificado', { ascending: true })
      .range(pagina * 1000, pagina * 1000 + 999)
    if (error) throw error
    if (!data.length) break
    await comoRemoto(() =>
      db.transaction('rw', TABLAS_SYNC.map((t) => db.table(t)), async () => {
        for (const fila of data) {
          if (!TABLAS_SYNC.includes(fila.tabla)) continue
          const tabla = db.table(fila.tabla)
          const local = await tabla.get(fila.id)
          if (local && (local.updatedAt || 0) > fila.actualizado) continue
          if (fila.borrado) {
            if (local) await tabla.delete(fila.id)
          } else {
            await tabla.put(fila.data)
          }
          if (fila.tabla === 'movimientos' && fila.data?.productoId) productosTocados.add(fila.data.productoId)
          if (fila.tabla === 'productos') productosTocados.add(fila.id)
        }
      }),
    )
    const ultimo = data.at(-1).modificado
    if (ultimo > desde) desde = ultimo
    if (data.length < 1000) break
    pagina++
  }
  localStorage.setItem('mjt-ultimo-pull', desde)
  if (productosTocados.size) await recalcularStock([...productosTocados])
}

// ---- Arranque automático ----
let temporizador
function programar(ms = 3000) {
  clearTimeout(temporizador)
  temporizador = setTimeout(sincronizar, ms)
}

export function iniciarSync() {
  if (!supabase) return
  supabase.auth.onAuthStateChange((_evento, sesion) => {
    const usuario = sesion?.user ?? null
    const antes = estado.usuario?.id
    set({ usuario, fase: usuario ? estado.fase === 'sin-sesion' ? 'ok' : estado.fase : 'sin-sesion' })
    if (usuario && usuario.id !== antes) programar(200)
  })
  alCambiarLocal(() => programar(3000))
  window.addEventListener('online', () => programar(500))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && programar(500))
  setInterval(() => document.visibilityState === 'visible' && sincronizar(), 60000)
}
