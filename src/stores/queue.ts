import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiRequest } from '@/services/api'
import { getSocket } from '@/services/socket'
import { speechService } from '@/services/speech'

export interface Ticket {
  id: number
  ticket_number: string
  queue_type: 'priority' | 'regular'
  sequence_number: number
  status: 'waiting' | 'calling' | 'serving' | 'completed' | 'skipped'
  counter_id: number | null
  counter_name: string | null
  called_by_user_id: number | null
  created_at: string
  called_at: string | null
  served_at: string | null
  completed_at: string | null
  recalled_count: number
}

export interface CounterInfo {
  id: number
  name: string
  code: string
  is_active: number
  current_ticket_id: number | null
  updated_at: string
  current_ticket?: Ticket | null
  assigned_user?: { id: number; name: string; username: string } | null
}

export interface QueueSettings {
  id: number
  priority_ratio: number
  regular_ratio: number
  prefix_priority: string
  prefix_regular: string
  next_priority_seq: number
  next_regular_seq: number
  consecutive_priority_calls: number
  updated_at: string
}

export interface QueueSnapshot {
  settings: QueueSettings
  waitingTickets: Ticket[]
  callingTickets: Ticket[]
  recentCompleted: Ticket[]
  counters: CounterInfo[]
  stats: {
    totalWaiting: number
    priorityWaitingCount: number
    regularWaitingCount: number
    totalCompleted: number
  }
}

export const useQueueStore = defineStore('queue', () => {
  const snapshot = ref<QueueSnapshot>({
    settings: {
      id: 1,
      priority_ratio: 2,
      regular_ratio: 1,
      prefix_priority: 'P',
      prefix_regular: 'R',
      next_priority_seq: 1,
      next_regular_seq: 1,
      consecutive_priority_calls: 0,
      updated_at: ''
    },
    waitingTickets: [],
    callingTickets: [],
    recentCompleted: [],
    counters: [],
    stats: {
      totalWaiting: 0,
      priorityWaitingCount: 0,
      regularWaitingCount: 0,
      totalCompleted: 0
    }
  })

  const isLoading = ref(false)
  const lastCalledTicket = ref<{ ticket_number: string; counter_name: string; queue_type: string; isRecall?: boolean } | null>(null)
  let isSocketInitialized = false

  const waitingTickets = computed(() => snapshot.value.waitingTickets)
  const callingTickets = computed(() => snapshot.value.callingTickets)
  const recentCompleted = computed(() => snapshot.value.recentCompleted)
  const counters = computed(() => snapshot.value.counters)
  const stats = computed(() => snapshot.value.stats)
  const settings = computed(() => snapshot.value.settings)

  function initSocket(options?: { enableSpeech?: boolean }) {
    if (isSocketInitialized) return
    isSocketInitialized = true

    const socket = getSocket()

    socket.on('queue:snapshot_updated', (data: QueueSnapshot) => {
      snapshot.value = data
    })

    socket.on('queue:ticket_called', (payload: { ticket_number: string; counter_name: string; queue_type: string; isRecall?: boolean }) => {
      lastCalledTicket.value = payload
      if (options?.enableSpeech !== false) {
        speechService.announce(payload.ticket_number, payload.counter_name, payload.queue_type, payload.isRecall)
      }
    })
  }

  async function fetchSnapshot() {
    isLoading.value = true
    try {
      const data = await apiRequest<QueueSnapshot>('/api/queue/snapshot')
      snapshot.value = data
      return data
    } finally {
      isLoading.value = false
    }
  }

  async function generateTicket(queue_type: 'priority' | 'regular'): Promise<Ticket> {
    const res = await apiRequest<{ ticket: Ticket }>('/api/queue/ticket', {
      method: 'POST',
      body: JSON.stringify({ queue_type })
    })
    return res.ticket
  }

  async function callNext(counterId?: number): Promise<{ ticket: Ticket | null; message?: string }> {
    return await apiRequest<{ ticket: Ticket | null; message?: string }>('/api/queue/call-next', {
      method: 'POST',
      body: JSON.stringify({ counter_id: counterId })
    })
  }

  async function recall(counterId?: number): Promise<{ ticket: Ticket }> {
    return await apiRequest<{ ticket: Ticket }>('/api/queue/recall', {
      method: 'POST',
      body: JSON.stringify({ counter_id: counterId })
    })
  }

  async function startServing(counterId?: number): Promise<{ ticket: Ticket }> {
    return await apiRequest<{ ticket: Ticket }>('/api/queue/start-serving', {
      method: 'POST',
      body: JSON.stringify({ counter_id: counterId })
    })
  }

  async function complete(counterId?: number): Promise<{ ticket: Ticket }> {
    return await apiRequest<{ ticket: Ticket }>('/api/queue/complete', {
      method: 'POST',
      body: JSON.stringify({ counter_id: counterId })
    })
  }

  async function skip(counterId?: number): Promise<{ ticket: Ticket }> {
    return await apiRequest<{ ticket: Ticket }>('/api/queue/skip', {
      method: 'POST',
      body: JSON.stringify({ counter_id: counterId })
    })
  }

  return {
    snapshot,
    isLoading,
    lastCalledTicket,
    waitingTickets,
    callingTickets,
    recentCompleted,
    counters,
    stats,
    settings,
    initSocket,
    fetchSnapshot,
    generateTicket,
    callNext,
    recall,
    startServing,
    complete,
    skip
  }
})
