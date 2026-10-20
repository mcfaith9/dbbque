import { io, Socket } from 'socket.io-client'
import { ref } from 'vue'

export const isSocketConnected = ref(false)
export const socketError = ref<string | null>(null)

let socketInstance: Socket | null = null

export function getSocket(): Socket {
  if (socketInstance) return socketInstance

  socketInstance = io(window.location.origin, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  })

  socketInstance.on('connect', () => {
    isSocketConnected.value = true
    socketError.value = null
    socketInstance?.emit('queue:get_snapshot')
  })

  socketInstance.on('disconnect', (reason) => {
    isSocketConnected.value = false
    if (reason === 'io server disconnect') {
      socketInstance?.connect()
    }
  })

  socketInstance.on('connect_error', (err) => {
    isSocketConnected.value = false
    socketError.value = err.message
  })

  return socketInstance
}
