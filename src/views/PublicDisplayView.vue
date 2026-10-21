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
  Sparkles,
  Wifi,
  WifiOff,
  Clock,
  Users,
  CheckCircle2,
  Layers
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

// Current most prominent calling ticket
const primaryCallingTicket = computed<Ticket | null>(() => {
  if (queue.callingTickets.length > 0) {
    return queue.callingTickets[0]
  }
  if (queue.recentCompleted.length > 0) {
    return queue.recentCompleted[0]
  }
  return null
})

// Whether the primary ticket is actively being called right now
const isPrimaryActive = computed(() => {
  return primaryCallingTicket.value ? ['calling', 'serving'].includes(primaryCallingTicket.value.status) : false
})

// Visible waiting tickets (uncalled tickets in dispatch sequence, compact preview)
const maxVisibleWaiting = 6
const visibleWaitingTickets = computed(() => {
  return queue.waitingTickets.slice(0, maxVisibleWaiting)
})

const remainingWaitingCount = computed(() => {
  return Math.max(0, queue.waitingTickets.length - maxVisibleWaiting)
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
    <!-- Top Display Header -->
    <header class="h-16 md:h-18 shrink-0 border-b border-neutral-800/80 bg-neutral-900/95 px-6 md:px-8 flex items-center justify-between">
      <div class="flex items-center gap-3.5">
        <div class="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black text-xl shadow-md">
          Q
        </div>
        <div>
          <h1 class="text-lg md:text-xl font-black tracking-tight text-white flex items-center gap-2.5">
            <span>PUBLIC QUEUE DISPLAY</span>
            <span
              class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full"
              :class="isSocketConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'"
            >
              <component :is="isSocketConnected ? Wifi : WifiOff" class="size-3.5" />
              {{ isSocketConnected ? 'Live Synchronized' : 'Reconnecting...' }}
            </span>
          </h1>
          <p class="text-xs text-neutral-400 hidden sm:block">Please proceed to your assigned table when your ticket number is announced.</p>
        </div>
      </div>

      <!-- Controls: Audio Unlock / Fullscreen / Clock / Queue Count -->
      <div class="flex items-center gap-3 md:gap-4">
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer"
          :class="isVoiceEnabled && isAudioUnlocked
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
            : 'border-amber-500/50 bg-amber-500/10 text-amber-300 animate-pulse'"
          @click="unlockAndToggleSound"
        >
          <component :is="isVoiceEnabled && isAudioUnlocked ? Volume2 : VolumeX" class="size-4" />
          <span>{{ !isAudioUnlocked ? 'Enable Voice' : (isVoiceEnabled ? 'Voice ON' : 'Voice OFF') }}</span>
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
          <div class="text-base md:text-lg font-mono font-bold tracking-wider text-neutral-200">
            {{ currentTime }}
          </div>
          <div class="text-[10px] uppercase text-neutral-400 font-semibold tracking-wider">
            Waiting in queue: <strong class="text-amber-400">{{ queue.stats.totalWaiting }}</strong>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Workspace (Strictly bounded flex-1 min-h-0 to fit 1920x1080 without scrolling) -->
    <main class="flex-1 min-h-0 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch overflow-hidden">
      <!-- Left Column: Most Prominent Ticket Hero + Compact Waiting Queue Panel underneath (7 cols) -->
      <div class="lg:col-span-7 flex flex-col justify-between gap-4 min-h-0">
        <!-- 1. Hero: Most Prominent Ticket Being Called (Dominant upper card) -->
        <div class="flex-1 min-h-0 flex flex-col justify-between rounded-3xl border-2 border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/90 to-neutral-950 p-6 md:p-8 shadow-2xl relative overflow-hidden">
          <!-- Hero Header -->
          <div class="flex items-center justify-between shrink-0">
            <div class="flex items-center gap-3">
              <span
                class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border shadow-xs"
                :class="isPrimaryActive
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'"
              >
                {{ isPrimaryActive ? '● NOW CALLING' : '✓ LAST CALLED' }}
              </span>

              <span
                v-if="primaryCallingTicket"
                class="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                :class="primaryCallingTicket.queue_type === 'priority'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'"
              >
                <Sparkles v-if="primaryCallingTicket.queue_type === 'priority'" class="size-3" />
                {{ primaryCallingTicket.queue_type }} Lane
              </span>
            </div>

            <div v-if="primaryCallingTicket?.called_at" class="text-xs text-neutral-400 font-mono flex items-center gap-1.5">
              <Clock class="size-3.5" />
              <span>Called at {{ new Date(primaryCallingTicket.called_at).toLocaleTimeString() }}</span>
            </div>
          </div>

          <!-- Center Huge Ticket Number and Destination Table -->
          <div v-if="primaryCallingTicket" class="my-auto py-3 text-center shrink-0">
            <div class="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-1">
              Queue Ticket Number
            </div>

            <!-- Extra large, readable from across a room -->
            <div class="text-7xl sm:text-8xl md:text-9xl lg:text-[8.5rem] font-black font-mono tracking-tight text-white drop-shadow-[0_12px_45px_rgba(255,255,255,0.2)] leading-none select-none">
              {{ primaryCallingTicket.ticket_number }}
            </div>

            <!-- Destination Counter / Table Card -->
            <div class="mt-5 md:mt-6 inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-neutral-800/90 border border-neutral-700 shadow-xl max-w-full">
              <span class="text-xs sm:text-sm uppercase tracking-wider text-neutral-400 font-semibold shrink-0">
                Please Proceed To:
              </span>
              <span class="text-2xl sm:text-3xl md:text-4xl font-extrabold text-amber-400 font-mono truncate">
                {{ primaryCallingTicket.counter_name || 'Assigned Table' }}
              </span>
            </div>

            <div v-if="primaryCallingTicket.recalled_count > 0" class="mt-2 text-xs text-amber-400 font-semibold">
              Repeating call ({{ primaryCallingTicket.recalled_count }}x)
            </div>
          </div>

          <div v-else class="my-auto py-10 text-center text-neutral-500">
            <Tv class="size-14 mx-auto mb-3 opacity-30" />
            <h2 class="text-2xl font-bold text-neutral-300">All Counters Ready</h2>
            <p class="text-sm text-neutral-500 mt-1">Next customer in queue will be announced here.</p>
          </div>

          <!-- Hero Footer -->
          <div class="pt-2.5 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400 shrink-0">
            <div class="flex items-center gap-2">
              <span class="size-2 rounded-full bg-emerald-400"></span>
              <span>Policy: <strong>{{ queue.settings.priority_ratio }} Priority : {{ queue.settings.regular_ratio }} Regular</strong></span>
            </div>
            <span class="text-neutral-500">DBBQUE System</span>
          </div>
        </div>

        <!-- 2. Waiting Queue Panel (Positioned directly under Main Hero, relatively short & compact) -->
        <div class="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-900/90 p-3.5 md:p-4 shadow-md flex flex-col">
          <div class="flex items-center justify-between pb-2 border-b border-neutral-800/80 mb-2.5 shrink-0">
            <div class="flex items-center gap-2">
              <Users class="size-4 text-amber-400" />
              <h2 class="text-xs md:text-sm font-bold uppercase tracking-wider text-neutral-200">
                Waiting Queue
              </h2>
              <span class="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                {{ queue.stats.totalWaiting }} uncalled
              </span>
            </div>

            <div class="text-[11px] text-neutral-400 flex items-center gap-2.5">
              <span class="flex items-center gap-1">
                <span class="size-1.5 rounded-full bg-amber-400"></span>
                <span>Priority: <strong>{{ queue.stats.priorityWaitingCount }}</strong></span>
              </span>
              <span class="text-neutral-600">&bull;</span>
              <span class="flex items-center gap-1">
                <span class="size-1.5 rounded-full bg-blue-400"></span>
                <span>Regular: <strong>{{ queue.stats.regularWaitingCount }}</strong></span>
              </span>
            </div>
          </div>

          <!-- Compact cards grid for uncalled waiting tickets -->
          <div v-if="visibleWaitingTickets.length > 0" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            <div
              v-for="(t, idx) in visibleWaitingTickets"
              :key="t.id"
              class="flex flex-col items-center justify-center py-2 px-2 rounded-xl border transition-all"
              :class="t.queue_type === 'priority'
                ? 'border-amber-500/40 bg-amber-500/10 shadow-2xs'
                : 'border-neutral-700/80 bg-neutral-800/80'"
            >
              <div class="text-[10px] font-semibold uppercase tracking-wider" :class="t.queue_type === 'priority' ? 'text-amber-400' : 'text-neutral-400'">
                #{{ idx + 1 }} {{ t.queue_type === 'priority' ? 'Priority' : 'Regular' }}
              </div>
              <div class="font-mono text-base sm:text-lg font-black tracking-wide text-white mt-0.5">
                {{ t.ticket_number }}
              </div>
            </div>

            <!-- "+X more waiting" overflow card if queue is large -->
            <div
              v-if="remainingWaitingCount > 0"
              class="flex flex-col items-center justify-center py-2 px-2 rounded-xl border border-dashed border-neutral-700 bg-neutral-800/40 text-neutral-400"
            >
              <span class="text-xs font-bold font-mono">+{{ remainingWaitingCount }}</span>
              <span class="text-[9px] uppercase tracking-wider">in line</span>
            </div>
          </div>

          <!-- Empty Queue state -->
          <div v-else class="py-2.5 text-center text-xs text-neutral-500 flex items-center justify-center gap-1.5">
            <CheckCircle2 class="size-3.5 text-emerald-500/80" />
            <span>No customers waiting</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Counter Stations Overview (Full-height structured table, 5 cols) -->
      <div class="lg:col-span-5 h-full min-h-0 flex flex-col rounded-3xl border border-neutral-800 bg-neutral-900/90 p-5 md:p-6 shadow-xl">
        <div class="flex items-center justify-between pb-3.5 border-b border-neutral-800 mb-3.5 shrink-0">
          <h2 class="text-xs md:text-sm font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
            <Layers class="size-4 text-primary" />
            <span>Counter Stations ({{ queue.counters.length }})</span>
          </h2>
          <span class="text-[11px] text-neutral-400">Station Activity</span>
        </div>

        <!-- 2-column compact grid fitting all 8 counters with generous spacing & clean layout -->
        <div class="grid grid-cols-2 gap-2.5 overflow-y-auto pr-1 flex-1 min-h-0">
          <div
            v-for="c in queue.counters"
            :key="c.id"
            class="flex items-center justify-between p-3 rounded-2xl border transition-all"
            :class="c.current_ticket
              ? 'border-neutral-700 bg-neutral-800/95 shadow-sm'
              : 'border-neutral-800/60 bg-neutral-900/40 opacity-70'"
          >
            <div class="flex items-center gap-2.5 min-w-0 pr-1">
              <span class="size-8 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-xs font-mono text-neutral-200 shrink-0">
                {{ c.code }}
              </span>
              <div class="min-w-0">
                <div class="font-bold text-xs md:text-sm text-white truncate">{{ c.name }}</div>
                <div class="text-[10px] text-neutral-400 truncate">
                  {{ c.assigned_user?.name || 'Available' }}
                </div>
              </div>
            </div>

            <div class="shrink-0 text-right">
              <span
                v-if="c.current_ticket"
                class="font-mono font-black text-sm md:text-base px-2.5 py-1 rounded-lg tracking-wider"
                :class="c.current_ticket.queue_type === 'priority'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-neutral-700 text-white'"
              >
                {{ c.current_ticket.ticket_number }}
              </span>
              <span v-else class="text-[11px] text-neutral-500 italic">
                Idle
              </span>
            </div>
          </div>
        </div>

        <!-- Station Summary Footer -->
        <div class="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400 shrink-0 mt-3">
          <span>Active Stations: <strong>{{ queue.counters.filter(c => c.is_active).length }}</strong></span>
          <span>Completed Today: <strong class="text-emerald-400">{{ queue.stats.totalCompleted }}</strong></span>
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
