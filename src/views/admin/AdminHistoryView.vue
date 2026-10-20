<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { History, ShieldAlert, RotateCw, Search, Sparkles } from '@lucide/vue'

const tickets = ref<any[]>([])
const auditLogs = ref<any[]>([])
const activeTab = ref<'tickets' | 'audit'>('tickets')
const searchQuery = ref('')
const statusFilter = ref('all')
const isLoading = ref(false)

onMounted(loadHistory)

async function loadHistory() {
  isLoading.value = true
  try {
    const [tRes, aRes] = await Promise.all([
      apiRequest<{ tickets: any[] }>('/api/admin/history?limit=200'),
      apiRequest<{ logs: any[] }>('/api/admin/audit-logs?limit=100')
    ])
    tickets.value = tRes.tickets
    auditLogs.value = aRes.logs
  } finally {
    isLoading.value = false
  }
}

const filteredTickets = computed(() => {
  return tickets.value.filter(t => {
    const matchesSearch = !searchQuery.value ||
      t.ticket_number.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (t.counter_name && t.counter_name.toLowerCase().includes(searchQuery.value.toLowerCase())) ||
      (t.called_by_name && t.called_by_name.toLowerCase().includes(searchQuery.value.toLowerCase()))

    const matchesStatus = statusFilter.value === 'all' || t.status === statusFilter.value

    return matchesSearch && matchesStatus
  })
})

function formatDuration(start?: string, end?: string): string {
  if (!start || !end) return '-'
  const diffSec = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000))
  const mins = Math.floor(diffSec / 60)
  const secs = diffSec % 60
  return `${mins}m ${secs}s`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-foreground">Queue History & Audit Trail</h2>
        <p class="text-xs text-muted-foreground mt-0.5">
          Review historical ticket lifecycles, service durations, and server-side audit logs.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-9 cursor-pointer" @click="loadHistory">
          <RotateCw class="size-3.5 mr-1.5" /> Refresh
        </Button>
      </div>
    </div>

    <!-- Tabs Header -->
    <div class="flex items-center gap-2 border-b border-border pb-3">
      <button
        type="button"
        class="px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        :class="activeTab === 'tickets' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-muted'"
        @click="activeTab = 'tickets'"
      >
        <span class="flex items-center gap-1.5">
          <History class="size-3.5" /> Ticket Archive ({{ tickets.length }})
        </span>
      </button>

      <button
        type="button"
        class="px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        :class="activeTab === 'audit' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-muted'"
        @click="activeTab = 'audit'"
      >
        <span class="flex items-center gap-1.5">
          <ShieldAlert class="size-3.5" /> Security & Audit Logs ({{ auditLogs.length }})
        </span>
      </button>
    </div>

    <!-- Ticket History Tab -->
    <div v-if="activeTab === 'tickets'" class="space-y-4">
      <!-- Search & Filters -->
      <div class="flex flex-col sm:flex-row items-center gap-3">
        <div class="relative flex-1 w-full">
          <Search class="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Search ticket #, counter, or staff..."
            class="pl-9 h-9"
          />
        </div>

        <select
          v-model="statusFilter"
          class="w-full sm:w-44 rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-xs focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="serving">Serving</option>
          <option value="calling">Calling</option>
          <option value="waiting">Waiting</option>
          <option value="skipped">Skipped</option>
        </select>
      </div>

      <div class="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-16">ID</TableHead>
              <TableHead>Ticket #</TableHead>
              <TableHead>Lane</TableHead>
              <TableHead>Counter</TableHead>
              <TableHead>Attending Staff</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="t in filteredTickets" :key="t.id">
              <TableCell class="font-mono text-xs text-muted-foreground font-medium">#{{ t.id }}</TableCell>
              <TableCell class="font-mono font-black text-sm">
                {{ t.ticket_number }}
              </TableCell>
              <TableCell>
                <span
                  class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                  :class="t.queue_type === 'priority' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'"
                >
                  <Sparkles v-if="t.queue_type === 'priority'" class="size-2.5" />
                  {{ t.queue_type }}
                </span>
              </TableCell>
              <TableCell class="font-medium text-xs">
                {{ t.counter_name || '-' }}
              </TableCell>
              <TableCell class="text-xs text-muted-foreground">
                {{ t.called_by_name || '-' }}
              </TableCell>
              <TableCell class="text-xs text-muted-foreground">
                {{ new Date(t.created_at).toLocaleTimeString() }}
              </TableCell>
              <TableCell class="text-xs font-mono">
                {{ formatDuration(t.called_at, t.completed_at) }}
              </TableCell>
              <TableCell>
                <span
                  class="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                  :class="{
                    'bg-emerald-500/10 text-emerald-600': t.status === 'completed',
                    'bg-blue-500/10 text-blue-600': t.status === 'calling' || t.status === 'serving',
                    'bg-muted text-muted-foreground': t.status === 'waiting',
                    'bg-rose-500/10 text-rose-600': t.status === 'skipped',
                  }"
                >
                  {{ t.status }}
                </span>
              </TableCell>
            </TableRow>

            <TableRow v-if="filteredTickets.length === 0">
              <TableCell colspan="8" class="text-center py-8 text-xs text-muted-foreground">
                No matching tickets found in history.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>

    <!-- Audit Logs Tab -->
    <div v-else class="space-y-4">
      <div class="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-16">ID</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="log in auditLogs" :key="log.id">
              <TableCell class="font-mono text-xs text-muted-foreground">#{{ log.id }}</TableCell>
              <TableCell class="text-xs text-muted-foreground font-mono">
                {{ new Date(log.created_at).toLocaleString() }}
              </TableCell>
              <TableCell>
                <span class="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-muted text-foreground">
                  {{ log.action }}
                </span>
              </TableCell>
              <TableCell class="text-xs font-medium">
                {{ log.user_name ? `${log.user_name} (@${log.username})` : 'System' }}
              </TableCell>
              <TableCell class="text-xs font-mono text-muted-foreground max-w-md truncate">
                {{ log.details }}
              </TableCell>
            </TableRow>

            <TableRow v-if="auditLogs.length === 0">
              <TableCell colspan="5" class="text-center py-8 text-xs text-muted-foreground">
                No audit logs recorded yet.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  </div>
</template>
