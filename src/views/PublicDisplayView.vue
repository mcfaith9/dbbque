<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQueueStore, type Ticket } from '@/stores/queue'
import { isSocketConnected } from '@/services/socket'
import { speechService, isAudioUnlocked, isVoiceEnabled } from '@/services/speech'
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Tv,
  WifiOff,
  Clock,
  Users,
  CheckCircle2,
  Layers,
  History
} from '@lucide/vue'

const queue = useQueueStore()
const isFullscreen = ref(false)
const currentTime = ref(new Date().toLocaleTimeString())

onMounted(() => {
  queue.initSocket({ enableSpeech: true })
  queue.fetchSnapshot().catch(() => {})

  setInterval(() => {
    currentTime.value = new Date().toLocaleTimeString()
  }, 1000)
})

// Current most prominent calling ticket for the hero section
const primaryCallingTicket = computed<Ticket | null>(() => {
  if (queue.callingTickets.length > 0) {
    return queue.callingTickets[0]
  }
  if (queue.recentCompleted.length > 0) {
    return queue.recentCompleted[0]
  }
  return null
})

// Whether the primary ticket is actively in calling/serving state
const isPrimaryActive = computed(() => {
  return primaryCallingTicket.value ? ['calling', 'serving'].includes(primaryCallingTicket.value.status) : false
})

// Max capacity for compact cards in Waiting Queue & Recently Called panels
const maxCapacity = 12

// 1. Waiting Queue: Only genuine uncalled tickets (status === 'waiting') in FIFO sequence
const visibleWaitingTickets = computed(() => {
  return queue.waitingTickets.slice(0, maxCapacity)
})

const remainingWaitingCount = computed(() => {
  return Math.max(0, queue.waitingTickets.length - maxCapacity)
})

// 2. Recently Called: Tickets that were called, serving, completed, or skipped
const recentlyCalledTickets = computed<Ticket[]>(() => {
  const map = new Map<number, Ticket>()

  // Add currently calling/serving tickets
  for (const t of queue.callingTickets) {
    map.set(t.id, t)
  }

  // Add completed and skipped tickets
  for (const t of queue.recentCompleted) {
    if (!map.has(t.id)) {
      map.set(t.id, t)
    }
  }

  const list = Array.from(map.values())

  // Sort by most recent event time descending
  list.sort((a, b) => {
    const timeA = new Date(a.completed_at || a.called_at || a.created_at).getTime()
    const timeB = new Date(b.completed_at || b.called_at || b.created_at).getTime()
    return timeB - timeA
  })

  // Avoid showing the current hero ticket as a duplicate in recently called if more tickets exist
  if (primaryCallingTicket.value && list.length > 1) {
    const filtered = list.filter(t => t.id !== primaryCallingTicket.value?.id)
    return filtered.slice(0, maxCapacity)
  }

  return list.slice(0, maxCapacity)
})

const remainingRecentCount = computed(() => {
  const total = (queue.callingTickets.length + queue.recentCompleted.length) - (primaryCallingTicket.value ? 1 : 0)
  return Math.max(0, total - maxCapacity)
})

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {})
    isFullscreen.value = true
  } else {
    document.exitFullscreen().catch(() => {})
    isFullscreen.value = false
  }
}

function unlockAndToggleSound() {
  speechService.unlockAudio()
  isVoiceEnabled.value = !isVoiceEnabled.value
}
</script>

<template>
  <div class="h-screen max-h-screen w-screen bg-neutral-950 text-white flex flex-col justify-between selection:bg-neutral-800 overflow-hidden font-sans">
    <!-- Main Workspace: Bounded flex-1 to strictly prevent scrolling on 1920x1080 -->
    <main class="flex-1 min-h-0 p-4 md:p-5 flex flex-col justify-between gap-4 overflow-hidden">
      <!-- Top Row: Hero "Now Calling" (Left ~60%) + Counter Stations (Right ~40%) -->
      <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <!-- 1. Hero: Most Prominent Ticket Being Called (7 cols) -->
        <div class="lg:col-span-7 flex flex-col justify-between p-6 md:p-8 relative overflow-hidden min-h-0">
          <!-- Hero Header -->
          <!-- Controls: Audio Unlock / Fullscreen / Clock / Queue Count -->
          <div class="flex items-center gap-3 md:gap-4 ml-auto">
            <button
              type="button"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer"
              :class="isVoiceEnabled && isAudioUnlocked
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/50 bg-amber-500/10 text-amber-300 animate-pulse'"
              @click="unlockAndToggleSound"
            >
              <component :is="isVoiceEnabled && isAudioUnlocked ? Volume2 : VolumeX" class="size-4" />
            </button>

            <button
              type="button"
              class="p-2 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors cursor-pointer"
              title="Toggle Fullscreen"
              @click="toggleFullscreen"
            >
              <component :is="isFullscreen ? Minimize2 : Maximize2" class="size-4" />
            </button>

            <div class="text-right pl-3 border-l border-neutral-800">
              <div class="text-base md:text-2xl font-mono font-bold tracking-wider text-neutral-200">
                {{ currentTime }}
              </div>
              <div class="text-[10px] uppercase text-neutral-400 font-semibold tracking-wider">
                Waiting in queue: <strong class="text-amber-400">{{ queue.stats.totalWaiting }}</strong>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between shrink-0">
            <div class="flex items-center gap-3">
              <span
                class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border shadow-xs"
                :class="isPrimaryActive
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 text-white animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'"
              >
                {{ isPrimaryActive ? '● NOW CALLING' : '✓ LAST CALLED' }}
              </span>
            </div>

            <div v-if="primaryCallingTicket?.called_at" class="text-xs text-neutral-400 font-mono flex items-center gap-1.5">
              <Clock class="size-3.5" />
              <span>Called at {{ new Date(primaryCallingTicket.called_at).toLocaleTimeString() }}</span>
            </div>
          </div>

          <!-- Center Huge Ticket Number and Destination Table -->
          <div v-if="primaryCallingTicket" class="my-auto py-2 text-center shrink-0">
            <div class="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-1">
              Current Queue Number
            </div>

            <!-- Extra large, readable from across a room -->
            <div class="text-7xl sm:text-8xl md:text-9xl lg:text-[8rem] xl:text-[9rem] font-black font-mono tracking-tight text-white drop-shadow-[0_12px_45px_rgba(255,255,255,0.2)] leading-none select-none">
              {{ primaryCallingTicket.ticket_number }}
            </div>

            <!-- Destination Counter / Table Card -->
            <div class="mt-4 md:mt-6 inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-neutral-800/90 border border-neutral-700 shadow-xl max-w-full">
              <span class="text-xs sm:text-sm uppercase tracking-wider text-neutral-400 font-semibold shrink-0">
                Please Proceed To:
              </span>
              <span class="text-2xl sm:text-3xl md:text-4xl font-extrabold text-amber-400 font-mono uppercase truncate">
                {{ primaryCallingTicket.counter_name || 'Assigned Table' }}
              </span>
            </div>

            <div v-if="primaryCallingTicket.recalled_count > 0" class="mt-2 text-xs text-amber-400 font-semibold">
              Repeating call ({{ primaryCallingTicket.recalled_count }}x)
            </div>
          </div>

          <div v-else class="my-auto py-8 text-center text-neutral-500">
            <Tv class="size-14 mx-auto mb-3 opacity-30" />
            <h2 class="text-2xl font-bold text-neutral-300">All Counters Ready</h2>
            <p class="text-sm text-neutral-500 mt-1">Next customer in queue will be announced here.</p>
          </div>
        </div>

        <!-- 2. Counter Stations Overview (5 cols, compact & balanced cards) -->
        <div class="lg:col-span-5 flex flex-col justify-between rounded-3xl border border-neutral-800 bg-neutral-900/90 p-4 md:p-5 shadow-xl min-h-0">
          <div class="flex items-center justify-between pb-2.5 border-b border-neutral-800 mb-2.5 shrink-0">
            <h2 class="text-xs md:text-sm font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <Layers class="size-4 text-primary" />
              <span>Counter Stations ({{ queue.counters.length }})</span>
            </h2>
            <span class="text-[11px] text-neutral-400">Live Station Status</span>
          </div>

          <!-- Compact 2-column station grid: fits 8 stations without stretching or scrolling -->
          <div class="grid grid-cols-2 gap-2 overflow-y-auto pr-1 flex-1 min-h-0">
            <div
              v-for="c in queue.counters"
              :key="c.id"
              class="flex items-center justify-between p-2.5 rounded-xl border transition-all"
              :class="c.current_ticket
                ? 'border-neutral-700 bg-neutral-800/95 shadow-xs'
                : 'border-neutral-800/60 bg-neutral-900/40 opacity-70'"
            >
              <div class="flex items-center gap-2 min-w-0 pr-1">
                <span class="size-7 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-xs font-mono text-neutral-200 shrink-0">
                  {{ c.code }}
                </span>
                <div class="min-w-0">
                  <div class="font-bold text-xs text-white truncate">{{ c.name }}</div>
                  <div class="text-[10px] text-neutral-400 truncate">
                    {{ c.assigned_user?.name || 'Available' }}
                  </div>
                </div>
              </div>

              <div class="shrink-0 text-right">
                <span
                  v-if="c.current_ticket"
                  class="font-mono font-black text-sm md:text-base px-2 py-0.5 rounded-lg tracking-wider"
                  :class="c.current_ticket.queue_type === 'priority'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-neutral-700 text-white'"
                >
                  {{ c.current_ticket.ticket_number }}
                </span>
                <span v-else class="text-[10px] text-neutral-500 italic">
                  Idle
                </span>
              </div>
            </div>
          </div>

          <!-- Counter Stations Footer -->
          <div class="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400 shrink-0 mt-2">
            <span>Active: <strong>{{ queue.counters.filter(c => c.is_active).length }}</strong></span>
            <span>Completed Today: <strong class="text-emerald-400">{{ queue.stats.totalCompleted }}</strong></span>
          </div>
        </div>
      </div>

      <!-- Bottom Row: Equal Size Side-by-Side Panels (Waiting Queue on Left, Recently Called on Right) -->
      <!-- Both have identical height, width (50% each), card dimensions, and capacity for 6-12 records -->
      <div class="h-44 md:h-48 shrink-0 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch min-h-0">
        <!-- Panel 1: Waiting Queue (Left, directly under Hero) -->
        <div class="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-3.5 flex flex-col justify-between shadow-md min-h-0 min-w-0">
          <!-- Panel Header -->
          <div class="flex items-center justify-between pb-2 border-b border-neutral-800/80 mb-2 shrink-0">
            <div class="flex items-center gap-2 min-w-0">
              <Users class="size-4 text-amber-400 shrink-0" />
              <h2 class="text-xs md:text-sm font-bold uppercase tracking-wider text-neutral-200 truncate">
                Waiting Queue
              </h2>
              <span class="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 shrink-0">
                {{ queue.stats.totalWaiting }}
              </span>
            </div>

            <div class="text-[10px] text-neutral-400 flex items-center gap-2 shrink-0">
              <span class="flex items-center gap-1">
                <span class="size-1.5 rounded-full bg-amber-400"></span>
                <span>P: <strong>{{ queue.stats.priorityWaitingCount }}</strong></span>
              </span>
              <span class="text-neutral-600">&bull;</span>
              <span class="flex items-center gap-1">
                <span class="size-1.5 rounded-full bg-blue-400"></span>
                <span>R: <strong>{{ queue.stats.regularWaitingCount }}</strong></span>
              </span>
            </div>
          </div>

          <!-- Cards Grid (6 to 12 capacity, 2 rows of up to 6 columns) -->
          <div v-if="visibleWaitingTickets.length > 0" class="grid grid-cols-4 sm:grid-cols-6 gap-2 flex-1 min-h-0 items-stretch overflow-hidden">
            <div
              v-for="(t, idx) in visibleWaitingTickets"
              :key="t.id"
              class="flex flex-col justify-between p-1.5 rounded-xl border text-center transition-all min-w-0"
              :class="t.queue_type === 'priority'
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-neutral-700/80 bg-neutral-800/80'"
            >
              <div class="flex items-center justify-between text-[9px] font-bold px-0.5">
                <span class="text-neutral-400">#{{ idx + 1 }}</span>
                <span :class="t.queue_type === 'priority' ? 'text-amber-400' : 'text-neutral-400'">
                  {{ t.queue_type === 'priority' ? 'PRI' : 'REG' }}
                </span>
              </div>
              <div class="font-mono text-sm sm:text-base font-black tracking-wide text-white truncate my-0.5">
                {{ t.ticket_number }}
              </div>
              <div class="text-[9px] text-neutral-400 truncate">
                Waiting
              </div>
            </div>

            <!-- Overflow indicator if queue exceeds visible capacity -->
            <div
              v-if="remainingWaitingCount > 0"
              class="flex flex-col items-center justify-center p-1.5 rounded-xl border border-dashed border-neutral-700 bg-neutral-800/40 text-neutral-400"
            >
              <span class="text-xs font-bold font-mono">+{{ remainingWaitingCount }}</span>
              <span class="text-[8px] uppercase tracking-wider">in line</span>
            </div>
          </div>

          <!-- Empty Queue state -->
          <div v-else class="flex-1 flex items-center justify-center text-xs text-neutral-500 gap-1.5">
            <CheckCircle2 class="size-3.5 text-emerald-500/80" />
            <span>No customers waiting</span>
          </div>
        </div>

        <!-- Panel 2: Recently Called / Served (Right, directly under Counter Stations) -->
        <div class="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-3.5 flex flex-col justify-between shadow-md min-h-0 min-w-0">
          <!-- Panel Header -->
          <div class="flex items-center justify-between pb-2 border-b border-neutral-800/80 mb-2 shrink-0">
            <div class="flex items-center gap-2 min-w-0">
              <History class="size-4 text-emerald-400 shrink-0" />
              <h2 class="text-xs md:text-sm font-bold uppercase tracking-wider text-neutral-200 truncate">
                Recently Called
              </h2>
              <span class="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 shrink-0">
                {{ recentlyCalledTickets.length }}
              </span>
            </div>

            <div class="text-[10px] text-neutral-400 flex items-center gap-2 shrink-0">
              <span class="text-neutral-400">Recent Service Activity</span>
            </div>
          </div>

          <!-- Cards Grid (6 to 12 capacity, identical grid and card dimensions) -->
          <div v-if="recentlyCalledTickets.length > 0" class="grid grid-cols-4 gap-2 flex-1 min-h-0 items-stretch overflow-hidden">
            <div
              v-for="item in recentlyCalledTickets"
              :key="item.id"
              class="flex flex-col justify-between p-1.5 rounded-xl border text-center transition-all min-w-0"
              :class="{
                'border-rose-500/40 bg-rose-500/10': item.status === 'skipped',
                'border-emerald-500/30 bg-neutral-800/90': item.status === 'completed',
                'border-amber-500/40 bg-amber-500/10': item.queue_type === 'priority' && item.status !== 'completed' && item.status !== 'skipped',
                'border-neutral-700/80 bg-neutral-800/80': item.queue_type === 'regular' && item.status !== 'completed' && item.status !== 'skipped',
              }"
            >
              <!-- Top row: Status Tag (Calling, Serving, Done, Skipped) -->
              <div class="flex items-center justify-between text-[9px] font-bold px-0.5">
                <span
                  class="uppercase"
                  :class="{
                    'text-emerald-400': item.status === 'completed',
                    'text-rose-400': item.status === 'skipped',
                    'text-blue-400': item.status === 'serving',
                    'text-amber-400': item.status === 'calling',
                  }"
                >
                  {{ item.status === 'completed' ? 'Done' : (item.status === 'skipped' ? 'Skip' : item.status) }}
                </span>
                <span :class="item.queue_type === 'priority' ? 'text-amber-400' : 'text-neutral-400'">
                  {{ item.queue_type === 'priority' ? 'PRI' : 'REG' }}
                </span>
              </div>

              <!-- Center: Ticket Number -->
              <div class="font-mono text-sm sm:text-base font-black tracking-wide text-white truncate my-0.5">
                {{ item.ticket_number }}
              </div>
            </div>

            <!-- Overflow indicator if recent records exceed visible capacity -->
            <div
              v-if="remainingRecentCount > 0"
              class="flex flex-col items-center justify-center p-1.5 rounded-xl border border-dashed border-neutral-700 bg-neutral-800/40 text-neutral-400"
            >
              <span class="text-xs font-bold font-mono">+{{ remainingRecentCount }}</span>
              <span class="text-[8px] uppercase tracking-wider">earlier</span>
            </div>
          </div>

          <!-- Empty Recent Calls state -->
          <div v-else class="flex-1 flex items-center justify-center text-xs text-neutral-500 gap-1.5">
            <Clock class="size-3.5 opacity-60" />
            <span>No previous calls recorded</span>
          </div>
        </div>
      </div>
    </main>

    <!-- Bottom Reconnection Notice (only shows if socket disconnected) -->
    <div
      v-if="!isSocketConnected"
      class="bg-amber-600 text-black px-6 py-2 text-center text-xs font-bold flex items-center justify-center gap-2 shrink-0"
    >
      <WifiOff class="size-4 animate-spin" />
      <span>Network connection interrupted. Automatically reconnecting and restoring current queue status...</span>
    </div>
  </div>
</template>
