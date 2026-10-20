<script setup lang="ts">
import { ref } from 'vue'
import { useQueueStore } from '@/stores/queue'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Users,
  Sparkles,
  CheckCircle2,
  PhoneCall,
  Clock,
  SlidersHorizontal,
  RotateCw
} from '@lucide/vue'

const queue = useQueueStore()
const isIssuing = ref(false)

async function issueTicket(type: 'priority' | 'regular') {
  if (isIssuing.value) return
  isIssuing.value = true
  try {
    await queue.generateTicket(type)
  } finally {
    isIssuing.value = false
  }
}

async function triggerCall(counterId: number) {
  await queue.callNext(counterId)
}

function refreshData() {
  queue.fetchSnapshot()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Bar with Refresh & Quick Actions -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-foreground">Live Queue Monitor</h2>
        <p class="text-xs text-muted-foreground mt-0.5">
          Real-time snapshot across all 8 counters, waiting tickets, and active calling events.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-9 cursor-pointer" @click="refreshData">
          <RotateCw class="size-3.5 mr-1.5" /> Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="h-9 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer"
          :disabled="isIssuing"
          @click="issueTicket('priority')"
        >
          <Sparkles class="size-3.5 mr-1.5" /> + Issue Priority
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="h-9 cursor-pointer"
          :disabled="isIssuing"
          @click="issueTicket('regular')"
        >
          <Users class="size-3.5 mr-1.5" /> + Issue Regular
        </Button>
      </div>
    </div>

    <!-- Stat Metrics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>Total In Queue</span>
          <Users class="size-4 text-primary" />
        </div>
        <div class="text-2xl font-black mt-2 text-foreground font-mono">
          {{ queue.stats.totalWaiting }}
        </div>
        <div class="text-[11px] text-muted-foreground mt-1">
          Currently waiting for service
        </div>
      </div>

      <div class="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>Priority Customers</span>
          <Sparkles class="size-4 text-amber-500" />
        </div>
        <div class="text-2xl font-black mt-2 text-amber-600 dark:text-amber-400 font-mono">
          {{ queue.stats.priorityWaitingCount }}
        </div>
        <div class="text-[11px] text-muted-foreground mt-1">
          Senior, PWD, Pregnant, Urgent
        </div>
      </div>

      <div class="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>Regular Customers</span>
          <Clock class="size-4 text-blue-500" />
        </div>
        <div class="text-2xl font-black mt-2 text-foreground font-mono">
          {{ queue.stats.regularWaitingCount }}
        </div>
        <div class="text-[11px] text-muted-foreground mt-1">
          Standard transaction lane
        </div>
      </div>

      <div class="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div class="flex items-center justify-between text-muted-foreground text-xs font-medium">
          <span>Completed Today</span>
          <CheckCircle2 class="size-4 text-emerald-500" />
        </div>
        <div class="text-2xl font-black mt-2 text-emerald-600 dark:text-emerald-400 font-mono">
          {{ queue.stats.totalCompleted }}
        </div>
        <div class="text-[11px] text-muted-foreground mt-1">
          Finished consultations
        </div>
      </div>
    </div>

    <!-- Active Counters Grid -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-foreground flex items-center gap-2">
          <SlidersHorizontal class="size-4 text-primary" />
          Service Counters ({{ queue.counters.length }})
        </h3>
        <span class="text-xs text-muted-foreground">
          Fair policy: {{ queue.settings.priority_ratio }} Priority : {{ queue.settings.regular_ratio }} Regular
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          v-for="c in queue.counters"
          :key="c.id"
          class="rounded-xl border bg-card p-4 shadow-2xs flex flex-col justify-between transition-all"
          :class="c.current_ticket ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'"
        >
          <div class="flex items-start justify-between">
            <div>
              <div class="font-bold text-sm text-foreground flex items-center gap-1.5">
                <span class="size-5 rounded bg-muted text-[10px] flex items-center justify-center font-mono font-bold">
                  {{ c.code }}
                </span>
                {{ c.name }}
              </div>
              <div class="text-[11px] text-muted-foreground mt-0.5">
                {{ c.assigned_user?.name || 'Unassigned Staff' }}
              </div>
            </div>

            <span
              class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
              :class="c.current_ticket ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
            >
              {{ c.current_ticket ? c.current_ticket.status : 'Idle' }}
            </span>
          </div>

          <div class="my-4 text-center py-2 rounded-lg bg-muted/40">
            <div v-if="c.current_ticket">
              <span class="text-xs text-muted-foreground block mb-0.5 uppercase tracking-wider font-semibold">
                Serving Now
              </span>
              <span
                class="font-mono text-2xl font-black"
                :class="c.current_ticket.queue_type === 'priority' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'"
              >
                {{ c.current_ticket.ticket_number }}
              </span>
            </div>
            <div v-else class="text-xs text-muted-foreground py-2 italic">
              No active customer
            </div>
          </div>

          <div class="pt-2 border-t border-border flex items-center justify-between text-xs">
            <span class="text-muted-foreground text-[11px]">
              {{ c.is_active ? 'Active' : 'Offline' }}
            </span>

            <Button
              variant="outline"
              size="sm"
              class="h-7 text-xs cursor-pointer"
              @click="triggerCall(c.id)"
            >
              <PhoneCall class="size-3 mr-1" /> Call Next
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Waiting Queue Table -->
    <div class="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
      <div class="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 class="font-bold text-sm text-foreground">Waiting List in Sequence</h3>
          <p class="text-xs text-muted-foreground mt-0.5">
            Customers queued in real-time according to dispatch order
          </p>
        </div>
        <span class="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-muted text-foreground">
          {{ queue.waitingTickets.length }} Waiting
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-16">Position</TableHead>
            <TableHead>Ticket Number</TableHead>
            <TableHead>Queue Lane</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="(t, index) in queue.waitingTickets" :key="t.id">
            <TableCell class="font-mono text-xs text-muted-foreground font-bold">
              #{{ index + 1 }}
            </TableCell>
            <TableCell class="font-mono font-black text-sm">
              {{ t.ticket_number }}
            </TableCell>
            <TableCell>
              <span
                class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                :class="t.queue_type === 'priority'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-muted text-muted-foreground'"
              >
                <Sparkles v-if="t.queue_type === 'priority'" class="size-3" />
                {{ t.queue_type }}
              </span>
            </TableCell>
            <TableCell class="text-xs text-muted-foreground">
              {{ new Date(t.created_at).toLocaleTimeString() }}
            </TableCell>
            <TableCell>
              <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 capitalize">
                {{ t.status }}
              </span>
            </TableCell>
          </TableRow>

          <TableRow v-if="queue.waitingTickets.length === 0">
            <TableCell colspan="5" class="text-center py-8 text-xs text-muted-foreground">
              Queue is empty. No customers currently waiting.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
