<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useQueueStore, type Ticket, type CounterInfo } from '@/stores/queue'
import { isSocketConnected } from '@/services/socket'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  PhoneCall,
  RotateCcw,
  Play,
  CheckCircle2,
  FastForward,
  LogOut,
  Users,
  Clock,
  Tv,
  AlertCircle,
  Sparkles
} from '@lucide/vue'

const auth = useAuthStore()
const queue = useQueueStore()
const router = useRouter()

const isActing = ref(false)
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const timerString = ref('00:00')
let timerInterval: any = null

onMounted(async () => {
  queue.initSocket({ enableSpeech: false })
  await queue.fetchSnapshot().catch(() => {})

  timerInterval = setInterval(updateActiveTimer, 1000)
})

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
})

// Current counter assigned to this user
const currentCounter = computed<CounterInfo | undefined>(() => {
  if (!auth.user?.counter_id) {
    // If admin or unassigned, default to counter 1 or first available
    return queue.counters[0]
  }
  return queue.counters.find(c => c.id === auth.user?.counter_id)
})

const activeTicket = computed<Ticket | null>(() => {
  return currentCounter.value?.current_ticket || null
})

function updateActiveTimer() {
  if (!activeTicket.value) {
    timerString.value = '00:00'
    return
  }
  const startTime = activeTicket.value.served_at || activeTicket.value.called_at || activeTicket.value.created_at
  if (!startTime) {
    timerString.value = '00:00'
    return
  }

  const startMs = new Date(startTime).getTime()
  const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
  const minutes = String(Math.floor(diffSec / 60)).padStart(2, '0')
  const seconds = String(diffSec % 60).padStart(2, '0')
  timerString.value = `${minutes}:${seconds}`
}

function showNotice(type: 'success' | 'error', text: string) {
  actionMessage.value = { type, text }
  setTimeout(() => {
    if (actionMessage.value?.text === text) actionMessage.value = null
  }, 4000)
}

async function handleCallNext() {
  if (isActing.value || !currentCounter.value) return
  isActing.value = true
  actionMessage.value = null

  try {
    const res = await queue.callNext(currentCounter.value.id)
    if (res.ticket) {
      showNotice('success', `Called ${res.ticket.ticket_number} to ${currentCounter.value.name}`)
    } else {
      showNotice('error', res.message || 'No tickets waiting in queue')
    }
  } catch (err: any) {
    showNotice('error', err.message || 'Call Next failed')
  } finally {
    isActing.value = false
  }
}

async function handleRecall() {
  if (isActing.value || !currentCounter.value) return
  isActing.value = true
  try {
    const res = await queue.recall(currentCounter.value.id)
    showNotice('success', `Recalled ${res.ticket.ticket_number} (Repeat announcement sent)`)
  } catch (err: any) {
    showNotice('error', err.message || 'Recall failed')
  } finally {
    isActing.value = false
  }
}

async function handleStartServing() {
  if (isActing.value || !currentCounter.value) return
  isActing.value = true
  try {
    const res = await queue.startServing(currentCounter.value.id)
    showNotice('success', `Now serving ${res.ticket.ticket_number}`)
  } catch (err: any) {
    showNotice('error', err.message || 'Failed to start serving')
  } finally {
    isActing.value = false
  }
}

async function handleComplete() {
  if (isActing.value || !currentCounter.value) return
  isActing.value = true
  try {
    const res = await queue.complete(currentCounter.value.id)
    showNotice('success', `Completed ticket ${res.ticket.ticket_number}`)
  } catch (err: any) {
    showNotice('error', err.message || 'Failed to complete ticket')
  } finally {
    isActing.value = false
  }
}

async function handleSkip() {
  if (isActing.value || !currentCounter.value) return
  isActing.value = true
  try {
    const res = await queue.skip(currentCounter.value.id)
    showNotice('success', `Ticket ${res.ticket.ticket_number} marked as skipped (no show)`)
  } catch (err: any) {
    showNotice('error', err.message || 'Failed to skip ticket')
  } finally {
    isActing.value = false
  }
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-muted/20 flex flex-col justify-between">
    <!-- Top Header -->
    <header class="border-b border-border bg-card px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
      <div class="flex items-center gap-3">
        <div class="size-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-xs">
          {{ currentCounter?.code || 'C' }}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-base font-bold text-foreground">
              {{ currentCounter?.name || 'Counter Terminal' }}
            </h1>
            <span
              class="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
              :class="isSocketConnected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600'"
            >
              <span class="size-1.5 rounded-full" :class="isSocketConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'"></span>
              {{ isSocketConnected ? 'Live' : 'Connecting' }}
            </span>
          </div>
          <p class="text-xs text-muted-foreground">
            Staff: <strong>{{ auth.user?.name || auth.user?.username }}</strong> &bull; {{ currentCounter?.code }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <RouterLink
          to="/display"
          target="_blank"
          class="hidden sm:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors"
        >
          <Tv class="size-3.5" /> Public Display
        </RouterLink>

        <Button variant="outline" size="sm" class="cursor-pointer" @click="handleLogout">
          <LogOut class="size-3.5 mr-1.5" /> Logout
        </Button>
      </div>
    </header>

    <!-- Main Workspace -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left 2 Cols: Active Ticket & Controls -->
      <div class="lg:col-span-2 flex flex-col gap-6">
        <!-- Action Notification Banner -->
        <Alert
          v-if="actionMessage"
          :variant="actionMessage.type === 'error' ? 'destructive' : 'default'"
          class="transition-all"
        >
          <AlertCircle v-if="actionMessage.type === 'error'" class="size-4" />
          <CheckCircle2 v-else class="size-4 text-emerald-500" />
          <AlertTitle>{{ actionMessage.type === 'error' ? 'Notice' : 'Success' }}</AlertTitle>
          <AlertDescription>{{ actionMessage.text }}</AlertDescription>
        </Alert>

        <!-- Current Ticket Card -->
        <div class="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div class="flex items-center justify-between border-b border-border pb-4">
            <div>
              <span class="text-xs uppercase font-bold tracking-wider text-muted-foreground">
                Current Assigned Ticket
              </span>
              <div class="flex items-center gap-2 mt-1">
                <span
                  v-if="activeTicket"
                  class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize"
                  :class="activeTicket.queue_type === 'priority' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30' : 'bg-muted text-muted-foreground'"
                >
                  <Sparkles v-if="activeTicket.queue_type === 'priority'" class="size-3" />
                  {{ activeTicket.queue_type }} Queue
                </span>
                <span
                  v-if="activeTicket"
                  class="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase"
                  :class="activeTicket.status === 'serving' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'"
                >
                  Status: {{ activeTicket.status }}
                </span>
              </div>
            </div>

            <div v-if="activeTicket" class="flex items-center gap-2 text-xs font-mono bg-muted/60 px-3 py-1.5 rounded-lg">
              <Clock class="size-3.5 text-muted-foreground" />
              <span>Elapsed: <strong>{{ timerString }}</strong></span>
            </div>
          </div>

          <!-- Big Ticket Number Display -->
          <div class="py-10 text-center">
            <div v-if="activeTicket">
              <div class="text-6xl md:text-8xl font-black tracking-tight text-foreground font-mono">
                {{ activeTicket.ticket_number }}
              </div>
              <p class="text-sm text-muted-foreground mt-2">
                Called at {{ activeTicket.called_at ? new Date(activeTicket.called_at).toLocaleTimeString() : 'now' }}
                <span v-if="activeTicket.recalled_count > 0" class="text-amber-600 font-semibold">
                  &bull; Recalled {{ activeTicket.recalled_count }}x
                </span>
              </p>
            </div>
            <div v-else class="py-8 text-center text-muted-foreground">
              <div class="size-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Users class="size-8 opacity-40" />
              </div>
              <h3 class="text-xl font-semibold text-foreground">Counter is currently idle</h3>
              <p class="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Click <strong>"Call Next"</strong> to summon the next customer according to the priority rules.
              </p>
            </div>
          </div>

          <!-- Actions Bar -->
          <div class="pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <!-- Call Next -->
            <Button
              size="lg"
              class="col-span-2 sm:col-span-1 bg-primary text-primary-foreground font-semibold shadow-xs cursor-pointer"
              :disabled="isActing"
              @click="handleCallNext"
            >
              <PhoneCall class="size-4 mr-1.5" /> Call Next
            </Button>

            <!-- Recall -->
            <Button
              variant="outline"
              size="lg"
              class="cursor-pointer"
              :disabled="isActing || !activeTicket"
              @click="handleRecall"
            >
              <RotateCcw class="size-4 mr-1.5" /> Recall
            </Button>

            <!-- Start Serving -->
            <Button
              variant="outline"
              size="lg"
              class="cursor-pointer"
              :disabled="isActing || !activeTicket || activeTicket.status === 'serving'"
              @click="handleStartServing"
            >
              <Play class="size-4 mr-1.5" /> Start Serving
            </Button>

            <!-- Complete -->
            <Button
              variant="default"
              size="lg"
              class="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              :disabled="isActing || !activeTicket"
              @click="handleComplete"
            >
              <CheckCircle2 class="size-4 mr-1.5" /> Complete
            </Button>

            <!-- Skip -->
            <Button
              variant="ghost"
              size="lg"
              class="text-destructive hover:bg-destructive/10 cursor-pointer"
              :disabled="isActing || !activeTicket"
              @click="handleSkip"
            >
              <FastForward class="size-4 mr-1.5" /> Skip
            </Button>
          </div>
        </div>

        <!-- Waiting Line Mini-List -->
        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold flex items-center gap-2">
              <Users class="size-4 text-primary" />
              Waiting In Queue ({{ queue.stats.totalWaiting }})
            </h3>
            <div class="text-xs text-muted-foreground flex items-center gap-3">
              <span class="flex items-center gap-1">
                <span class="size-2 rounded-full bg-amber-500"></span> Priority: <strong>{{ queue.stats.priorityWaitingCount }}</strong>
              </span>
              <span class="flex items-center gap-1">
                <span class="size-2 rounded-full bg-blue-500"></span> Regular: <strong>{{ queue.stats.regularWaitingCount }}</strong>
              </span>
            </div>
          </div>

          <div v-if="queue.waitingTickets.length > 0" class="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            <span
              v-for="(t, idx) in queue.waitingTickets"
              :key="t.id"
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold border"
              :class="t.queue_type === 'priority'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                : 'bg-muted border-border text-foreground'"
            >
              <span class="text-[10px] opacity-60 font-sans">#{{ idx + 1 }}</span>
              {{ t.ticket_number }}
            </span>
          </div>
          <div v-else class="text-center py-6 text-xs text-muted-foreground">
            No customers currently waiting.
          </div>
        </div>
      </div>

      <!-- Right Col: Counter Overview & Queue Status -->
      <div class="flex flex-col gap-6">
        <!-- Live System Counters Status -->
        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 class="text-sm font-semibold mb-3 flex items-center justify-between">
            <span>All Counters Status</span>
            <span class="text-xs font-normal text-muted-foreground">8 Counters</span>
          </h3>

          <div class="space-y-2">
            <div
              v-for="c in queue.counters"
              :key="c.id"
              class="flex items-center justify-between p-2.5 rounded-xl border text-xs"
              :class="c.id === currentCounter?.id ? 'border-primary bg-primary/5' : 'border-border bg-card'"
            >
              <div class="flex items-center gap-2.5">
                <span class="size-6 rounded-md bg-muted flex items-center justify-center font-bold text-[10px]">
                  {{ c.code }}
                </span>
                <div>
                  <div class="font-medium flex items-center gap-1.5">
                    {{ c.name }}
                    <span v-if="c.id === currentCounter?.id" class="text-[10px] text-primary font-bold">(You)</span>
                  </div>
                  <div class="text-[10px] text-muted-foreground">
                    {{ c.assigned_user?.name || 'Unassigned' }}
                  </div>
                </div>
              </div>

              <div>
                <span
                  v-if="c.current_ticket"
                  class="font-mono font-bold px-2 py-0.5 rounded-md text-[11px]"
                  :class="c.current_ticket.queue_type === 'priority' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-muted text-foreground'"
                >
                  {{ c.current_ticket.ticket_number }}
                </span>
                <span v-else class="text-[11px] text-muted-foreground italic">
                  Idle
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Recently Completed -->
        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 class="text-sm font-semibold mb-3">Recently Completed</h3>
          <div v-if="queue.recentCompleted.length > 0" class="space-y-2">
            <div
              v-for="t in queue.recentCompleted.slice(0, 5)"
              :key="t.id"
              class="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0"
            >
              <span class="font-mono font-bold">{{ t.ticket_number }}</span>
              <span class="text-muted-foreground">{{ t.counter_name || 'Counter' }}</span>
              <span
                class="capitalize text-[10px] px-2 py-0.5 rounded-full"
                :class="t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'"
              >
                {{ t.status }}
              </span>
            </div>
          </div>
          <div v-else class="text-xs text-muted-foreground py-2 text-center">
            No completed tickets yet today.
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
