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
  ArrowRight
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
  return queue.callingTickets[0] || null
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
  <div class="min-h-screen bg-neutral-950 text-white flex flex-col justify-between selection:bg-neutral-800 overflow-hidden font-sans">
    <!-- Top Display Header -->
    <header class="border-b border-neutral-800/80 bg-neutral-900/90 px-8 py-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="size-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black text-xl shadow-md">
          Q
        </div>
        <div>
          <h1 class="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-3">
            QUEUE STATUS DISPLAY
            <span
              class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full"
              :class="isSocketConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'"
            >
              <component :is="isSocketConnected ? Wifi : WifiOff" class="size-3.5" />
              {{ isSocketConnected ? 'Live Synchronized' : 'Reconnecting...' }}
            </span>
          </h1>
          <p class="text-xs text-neutral-400">Please proceed to your assigned table when your ticket number appears.</p>
        </div>
      </div>

      <!-- Controls: Audio Unlock / Sound Toggle / Fullscreen / Clock -->
      <div class="flex items-center gap-4">
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer"
          :class="isVoiceEnabled && isAudioUnlocked
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
            : 'border-amber-500/50 bg-amber-500/10 text-amber-300 animate-pulse'"
          @click="unlockAndToggleSound"
        >
          <component :is="isVoiceEnabled && isAudioUnlocked ? Volume2 : VolumeX" class="size-4" />
          <span>{{ !isAudioUnlocked ? 'Click to Enable Audio' : (isVoiceEnabled ? 'Voice ON' : 'Voice OFF') }}</span>
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
          <div class="text-lg font-mono font-bold tracking-wider text-neutral-200">
            {{ currentTime }}
          </div>
          <div class="text-[10px] uppercase text-neutral-500 font-semibold tracking-wider">
            Waiting in queue: {{ queue.stats.totalWaiting }}
          </div>
        </div>
      </div>
    </header>

    <!-- Main Live Screen Area -->
    <main class="flex-1 p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <!-- Left Hero Banner: Currently Called Ticket (7 cols) -->
      <div class="lg:col-span-7 flex flex-col justify-between rounded-3xl border-2 border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 p-8 md:p-12 shadow-2xl relative overflow-hidden">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
              ● Now Calling
            </span>
            <span
              v-if="primaryCallingTicket"
              class="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider"
              :class="primaryCallingTicket.queue_type === 'priority'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'"
            >
              <Sparkles v-if="primaryCallingTicket.queue_type === 'priority'" class="size-3" />
              {{ primaryCallingTicket.queue_type }} customer
            </span>
          </div>

          <div v-if="primaryCallingTicket" class="text-xs text-neutral-400 font-mono">
            Called at {{ new Date(primaryCallingTicket.called_at || '').toLocaleTimeString() }}
          </div>
        </div>

        <!-- Center Big Number & Counter -->
        <div v-if="primaryCallingTicket" class="my-auto py-8 text-center">
          <div class="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-2">
            Ticket Number
          </div>
          <div class="text-7xl sm:text-8xl md:text-9xl font-black font-mono tracking-tight text-white drop-shadow-[0_10px_35px_rgba(255,255,255,0.15)]">
            {{ primaryCallingTicket.ticket_number }}
          </div>

          <div class="mt-8 inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-neutral-800/90 border border-neutral-700 shadow-lg">
            <span class="text-sm uppercase tracking-wider text-neutral-400 font-semibold">Proceed To:</span>
            <span class="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono">
              {{ primaryCallingTicket.counter_name || 'Assigned Counter' }}
            </span>
          </div>
        </div>

        <div v-else class="my-auto py-16 text-center text-neutral-500">
          <Tv class="size-16 mx-auto mb-4 opacity-40" />
          <h2 class="text-3xl font-bold text-neutral-300">All Counters Are Ready</h2>
          <p class="text-sm text-neutral-500 mt-2">Next available customer will be announced shortly.</p>
        </div>

        <!-- Bottom status notice -->
        <div class="pt-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <span>Priority rules enabled ({{ queue.settings.priority_ratio }} Priority : {{ queue.settings.regular_ratio }} Regular)</span>
          <span class="text-neutral-500">System v1.0</span>
        </div>
      </div>

      <!-- Right 5 cols: Table of all counters & active calls -->
      <div class="lg:col-span-5 flex flex-col justify-between gap-6">
        <!-- Live Counters Assignment Table -->
        <div class="flex-1 rounded-3xl border border-neutral-800 bg-neutral-900/90 p-6 flex flex-col">
          <h2 class="text-base font-bold uppercase tracking-wider text-neutral-300 mb-4 flex items-center justify-between">
            <span>Counter Stations</span>
            <span class="text-xs text-neutral-500 font-normal">Active assignments</span>
          </h2>

          <div class="flex-1 space-y-2.5 overflow-y-auto pr-1">
            <div
              v-for="c in queue.counters"
              :key="c.id"
              class="flex items-center justify-between p-3.5 rounded-2xl border transition-all"
              :class="c.current_ticket
                ? 'border-neutral-700 bg-neutral-800/80 shadow-md'
                : 'border-neutral-800/60 bg-neutral-900/40 opacity-70'"
            >
              <div class="flex items-center gap-3">
                <span class="size-8 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-xs font-mono text-neutral-300">
                  {{ c.code }}
                </span>
                <div>
                  <div class="font-bold text-sm text-white">{{ c.name }}</div>
                  <div class="text-[11px] text-neutral-400">
                    {{ c.assigned_user?.name || 'Available' }}
                  </div>
                </div>
              </div>

              <div class="text-right">
                <div v-if="c.current_ticket" class="flex items-center gap-2">
                  <span
                    class="font-mono font-black text-lg px-3 py-1 rounded-xl tracking-wider"
                    :class="c.current_ticket.queue_type === 'priority'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-neutral-700 text-white'"
                  >
                    {{ c.current_ticket.ticket_number }}
                  </span>
                </div>
                <div v-else class="text-xs text-neutral-500 italic">
                  Idle
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Completed / Calling Ticker -->
        <div class="rounded-3xl border border-neutral-800 bg-neutral-900/90 p-5">
          <div class="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2.5">
            Recently Called Numbers
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="item in queue.callingTickets"
              :key="item.id"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-800 text-xs font-mono font-bold"
            >
              <span class="text-neutral-400 text-[10px]">{{ item.counter_name }}</span>
              <ArrowRight class="size-3 text-neutral-500" />
              <strong class="text-white">{{ item.ticket_number }}</strong>
            </span>
            <span v-if="queue.callingTickets.length === 0" class="text-xs text-neutral-500 py-1">
              No recent calls to display.
            </span>
          </div>
        </div>
      </div>
    </main>

    <!-- Bottom Reconnection Notice -->
    <div
      v-if="!isSocketConnected"
      class="bg-amber-600 text-black px-6 py-2 text-center text-xs font-bold flex items-center justify-center gap-2"
    >
      <WifiOff class="size-4 animate-spin" />
      <span>Network connection interrupted. Automatically reconnecting and restoring current queue status...</span>
    </div>
  </div>
</template>
