type EventHandler = (data: any) => void

type EventState = {
  handlers: Map<string, Set<EventHandler>>
  ws: WebSocket | null
  reconnectTimer: number | null
}

declare global {
  interface Window {
    __kovdatakEvents?: EventState
  }
}

function ensureEventState(): EventState {
  if (!window.__kovdatakEvents) {
    window.__kovdatakEvents = { handlers: new Map(), ws: null, reconnectTimer: null }
  }
  const state = window.__kovdatakEvents
  const scheduleReconnect = () => {
    if (state.reconnectTimer !== null) return
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null
      ensureEventState()
    }, 1500)
  }
  if (!state.ws) {
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws`)
      state.ws = ws
      ws.onmessage = (ev) => {
        let msg: any = null
        try { msg = JSON.parse(ev.data) } catch { /* ignore */ }
        if (!msg) return
        if (msg.type === 'scenario_added') emit('scenario:added', msg.record)
        if (msg.type === 'scenario_batch') {
          // Handle batch of records sent after stats_dir change
          if (Array.isArray(msg.records)) {
            for (const rec of msg.records) {
              emit('scenario:added', rec)
            }
          }
        }
        if (msg.type === 'watcher_restarted') emit('watcher:started', { path: msg.path })
        if (msg.type === 'traces_dir_updated') emit('traces:dir_updated', {})
        if (msg.type === 'benchmark_progresses_refreshed') {
          const data = msg.data || {}
          for (const k of Object.keys(data)) {
            emit('benchmark:progress:updated', { id: Number(k), progress: data[k] })
          }
        }
      }
      ws.onclose = () => {
        state.ws = null
        scheduleReconnect()
      }
      ws.onerror = () => {
        try { ws.close() } catch { /* ignore */ }
      }
    } catch {
      // ignore websocket init errors, retry later
      scheduleReconnect()
    }
  }
  return state
}

function emit(eventName: string, payload: any) {
  const state = window.__kovdatakEvents
  if (!state) return
  const set = state.handlers.get(eventName)
  if (!set) return
  for (const fn of Array.from(set)) {
    try { fn(payload) } catch { /* ignore */ }
  }
}

export function EventsOn(eventName: string, callback: EventHandler): () => void {
  const state = ensureEventState()
  const set = state.handlers.get(eventName) || new Set<EventHandler>()
  set.add(callback)
  state.handlers.set(eventName, set)
  return () => {
    const cur = state.handlers.get(eventName)
    if (cur) cur.delete(callback)
  }
}

