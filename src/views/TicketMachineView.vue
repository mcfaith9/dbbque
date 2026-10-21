<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useQueueStore, type Ticket } from '@/stores/queue'
import { isSocketConnected } from '@/services/socket'
import { printerService } from '@/services/printer'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Printer,
  Accessibility,
  UsersRound,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Tv,
  LayoutGrid
} from '@lucide/vue'

const auth = useAuthStore()
const queue = useQueueStore()
const router = useRouter()

const isGenerating = ref(false)
const latestTicket = ref<Ticket | null>(null)
const latestWaitingAhead = ref<number | undefined>(undefined)
const printStatus = ref<'idle' | 'printing' | 'success' | 'failed'>('idle')
const printErrorMessage = ref('')
const errorMessage = ref('')
const activePrinterName = ref('Detecting printer...')

onMounted(async () => {
  queue.initSocket({ enableSpeech: false })
  await queue.fetchSnapshot().catch(() => {})
  try {
    const config = await printerService.getConfig()
    activePrinterName.value = config.configuredPrinter || 'Windows Default Printer'
  } catch {
    activePrinterName.value = 'Windows Default Printer'
  }
})

const priorityWaitingCount = computed(() => queue.stats.priorityWaitingCount)
const regularWaitingCount = computed(() => queue.stats.regularWaitingCount)

async function handleGenerate(queueType: 'priority' | 'regular') {
  if (isGenerating.value) return
  isGenerating.value = true
  errorMessage.value = ''
  printErrorMessage.value = ''
  printStatus.value = 'printing'

  try {
    // 1. Run the existing ticket-generation workflow exactly once
    const ticket = await queue.generateTicket(queueType)
    latestTicket.value = ticket

    const waitingAhead = queueType === 'priority'
      ? priorityWaitingCount.value
      : regularWaitingCount.value
    latestWaitingAhead.value = Math.max(0, waitingAhead - 1)

    // 2. Automatically dispatch to physical printer without any browser print dialog
    const printRes = await printerService.printTicket({
      ticket_number: ticket.ticket_number,
      queue_type: ticket.queue_type,
      created_at: ticket.created_at,
      waiting_ahead: latestWaitingAhead.value
    })

    if (printRes.success) {
      printStatus.value = 'success'
    } else {
      printStatus.value = 'failed'
      printErrorMessage.value = printRes.message || 'Thermal printer is offline or disconnected.'
    }
  } catch (err: any) {
    // Ticket generation failed
    errorMessage.value = err.message || 'Failed to issue ticket'
    printStatus.value = 'idle'
  } finally {
    // Debounce to prevent rapid double-clicks on touchscreens
    setTimeout(() => {
      isGenerating.value = false
    }, 600)
  }
}

async function handleReprint() {
  if (!latestTicket.value || printStatus.value === 'printing') return
  printStatus.value = 'printing'
  printErrorMessage.value = ''

  // Safe retry: Re-sends the EXACT same ticket record to the printer without generating a new ticket
  const printRes = await printerService.printTicket({
    ticket_number: latestTicket.value.ticket_number,
    queue_type: latestTicket.value.queue_type,
    created_at: latestTicket.value.created_at,
    waiting_ahead: latestWaitingAhead.value
  })

  if (printRes.success) {
    printStatus.value = 'success'
  } else {
    printStatus.value = 'failed'
    printErrorMessage.value = printRes.message || 'Thermal printer retry failed. Please check paper and USB cable.'
  }
}

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div
    class="min-h-screen bg-cover bg-center bg-no-repeat text-white"
    style="background-image: url('/bg.avif')"
  >
    <div class="min-h-screen text-neutral-100 flex flex-col justify-between selection:bg-neutral-800">
      <!-- Main Content -->
      <main class="flex-1 max-w-5xl w-full mx-auto p-6 md:p-10 flex flex-col justify-center">
        <div class="text-center mb-8">
          <h2 class="text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-3">
            Welcome! Please Select Your Queue
          </h2>
          <p class="font-extrabold text-white text-base md:text-lg max-w-2xl mx-auto [text-shadow:1px_1px_2px_rgba(0,0,0,0.25)]">
            Press the button below to get your printed queue number slip.
          </p>

          <p class="italic text-white/80 text-xs md:text-base max-w-2xl mx-auto [text-shadow:1px_1px_2px_rgba(0,0,0,0.25)]">
            Pindutin ang button sa ibaba upang makuha ang iyong naka-print na numero sa pila.
          </p>
        </div>

        <Alert v-if="errorMessage" variant="destructive" class="mb-6 max-w-xl mx-auto">
          <AlertCircle class="size-4" />
          <AlertTitle>Notice</AlertTitle>
          <AlertDescription>{{ errorMessage }}</AlertDescription>
        </Alert>

        <!-- Big Action Buttons Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto w-full">
          <!-- Priority Card Button -->
          <button
            type="button"
            :disabled="isGenerating"
            class="group relative flex flex-col justify-between p-8 md:p-10 rounded-3xl border-2 border-amber-500/40 bg-neutral-900 bg-gradient-to-b from-neutral-900 to-neutral-950 hover:border-amber-400 hover:shadow-2xl hover:shadow-amber-500/10 active:scale-[0.98] transition-all text-left cursor-pointer disabled:cursor-wait disabled:opacity-100 disabled:pointer-events-none"
            @click="handleGenerate('priority')"
          >
            <div class="flex items-start justify-between">
              <div class="size-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Accessibility class="size-8" />
              </div>
              <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 uppercase tracking-wider">
                Express Lane
              </span>
            </div>

            <div class="my-6">
              <h3 class="text-2xl md:text-3xl font-bold text-white group-hover:text-amber-300 transition-colors">
                Priority Queue
              </h3>
              <p class="text-sm md:text-base text-neutral-400 mt-2">
                For Senior Citizens, Persons with Disabilities (PWD), Pregnant Women, and Urgent Inquiries.
              </p>
            </div>

            <div class="pt-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
              <span class="flex items-center gap-1.5">
                <UsersRound class="size-4 text-amber-400" />
                Waiting in lane: <strong class="text-white text-sm">{{ priorityWaitingCount }}</strong>
              </span>
              <span class="font-medium text-amber-400 group-hover:translate-x-1 transition-transform">
                {{ isGenerating ? 'Printing Ticket...' : 'Press to Print Slip &rarr;' }}
              </span>
            </div>
          </button>

          <!-- Regular Card Button -->
          <button
            type="button"
            :disabled="isGenerating"
            class="group relative flex flex-col justify-between p-8 md:p-10 rounded-3xl border-2 border-neutral-700 bg-neutral-900 bg-gradient-to-b from-neutral-900 to-neutral-950 hover:border-primary hover:shadow-2xl hover:shadow-primary/10 active:scale-[0.98] transition-all text-left cursor-pointer disabled:cursor-wait disabled:opacity-100 disabled:pointer-events-none"
            @click="handleGenerate('regular')"
          >
            <div class="flex items-start justify-between">
              <div class="size-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <UsersRound class="size-8" />
              </div>
              <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 uppercase tracking-wider">
                Standard
              </span>
            </div>

            <div class="my-6">
              <h3 class="text-2xl md:text-3xl font-bold text-white group-hover:text-primary transition-colors">
                Regular Queue
              </h3>
              <p class="text-sm md:text-base text-neutral-400 mt-2">
                For all standard inquiries, registrations, regular service requests, and transactions.
              </p>
            </div>

            <div class="pt-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
              <span class="flex items-center gap-1.5">
                <UsersRound class="size-4 text-neutral-300" />
                Waiting in lane: <strong class="text-white text-sm">{{ regularWaitingCount }}</strong>
              </span>
              <span class="font-medium text-primary group-hover:translate-x-1 transition-transform">
                {{ isGenerating ? 'Printing Ticket...' : 'Press to Print Slip &rarr;' }}
              </span>
            </div>
          </button>
        </div>

        <!-- Live Ticket Slip Dispensed Banner -->
        <div
          v-if="latestTicket"
          class="mt-8 max-w-xl mx-auto w-full p-5 rounded-2xl border shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 transition-all"
          :class="printStatus === 'failed' ? 'border-amber-500/50 bg-amber-950/20' : 'border-neutral-700 bg-neutral-900'"
        >
          <div class="flex items-center gap-4 text-left">
            <div
              class="size-12 rounded-xl flex items-center justify-center shrink-0"
              :class="printStatus === 'failed' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'"
            >
              <AlertCircle v-if="printStatus === 'failed'" class="size-6" />
              <CheckCircle2 v-else class="size-6" />
            </div>
            <div>
              <div class="text-xs flex items-center gap-1.5" :class="printStatus === 'failed' ? 'text-amber-300' : 'text-neutral-400'">
                <span v-if="printStatus === 'failed'" class="font-medium">Ticket Queued (Printer Offline)</span>
                <span v-else-if="printStatus === 'printing'" class="font-medium text-primary">Printing to Thermal Printer...</span>
                <span v-else>Ticket Dispensed & Printed</span>
                <span class="capitalize font-semibold text-neutral-300">({{ latestTicket.queue_type }})</span>
              </div>
              <div class="text-3xl font-black text-white tracking-wider">
                {{ latestTicket.ticket_number }}
              </div>
              <p v-if="printStatus === 'failed'" class="text-xs text-amber-400/90 mt-0.5">
                {{ printErrorMessage }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              size="sm"
              :disabled="printStatus === 'printing'"
              class="flex-1 md:flex-none border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 cursor-pointer disabled:opacity-100 disabled:cursor-wait"
              @click="handleReprint"
            >
              <Printer class="size-4 mr-1.5" :class="{ 'animate-pulse text-primary': printStatus === 'printing' }" />
              {{ printStatus === 'printing' ? 'Printing...' : printStatus === 'failed' ? 'Retry Print' : 'Print Again' }}
            </Button>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
