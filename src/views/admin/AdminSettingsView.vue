<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiRequest } from '@/services/api'
import { useQueueStore } from '@/stores/queue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle2, RotateCcw, AlertTriangle, Scale, Hash } from '@lucide/vue'

const queue = useQueueStore()
const isLoading = ref(false)
const notification = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const priorityRatio = ref(2)
const regularRatio = ref(1)
const prefixPriority = ref('P')
const prefixRegular = ref('R')

const isResetDialogOpen = ref(false)

onMounted(async () => {
  await loadSettings()
})

async function loadSettings() {
  isLoading.value = true
  try {
    const res = await apiRequest<{ settings: any }>('/api/admin/settings')
    priorityRatio.value = res.settings.priority_ratio
    regularRatio.value = res.settings.regular_ratio
    prefixPriority.value = res.settings.prefix_priority
    prefixRegular.value = res.settings.prefix_regular
  } finally {
    isLoading.value = false
  }
}

async function handleSaveSettings() {
  try {
    await apiRequest('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({
        priority_ratio: priorityRatio.value,
        regular_ratio: regularRatio.value,
        prefix_priority: prefixPriority.value.trim().toUpperCase(),
        prefix_regular: prefixRegular.value.trim().toUpperCase()
      })
    })

    notification.value = { type: 'success', text: 'Queue policy & numbering settings saved successfully.' }
    await queue.fetchSnapshot()
  } catch (err: any) {
    notification.value = { type: 'error', text: err.message || 'Failed to update settings' }
  } finally {
    setTimeout(() => {
      notification.value = null
    }, 4000)
  }
}

async function handleResetQueue() {
  try {
    await apiRequest('/api/admin/reset-queue', { method: 'POST' })
    notification.value = { type: 'success', text: 'Daily queue reset: sequences set to #001 and cleared in-progress tickets.' }
    isResetDialogOpen.value = false
    await queue.fetchSnapshot()
    await loadSettings()
  } catch (err: any) {
    notification.value = { type: 'error', text: err.message || 'Failed to reset queue' }
  }
}
</script>

<template>
  <div class="space-y-6 max-w-4xl">
    <div>
      <h2 class="text-2xl font-bold tracking-tight text-foreground">Queue Policy & Numbering Rules</h2>
      <p class="text-xs text-muted-foreground mt-0.5">
        Configure priority dispatch ratios, ticket number prefixes, and daily reset rules.
      </p>
    </div>

    <Alert
      v-if="notification"
      :class="notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'"
    >
      <CheckCircle2 v-if="notification.type === 'success'" class="size-4" />
      <AlertTriangle v-else class="size-4" />
      <AlertDescription>{{ notification.text }}</AlertDescription>
    </Alert>

    <!-- Priority Calling Ratio Settings -->
    <div class="rounded-xl border border-border bg-card p-6 shadow-2xs space-y-4">
      <div class="flex items-center gap-2 border-b border-border pb-3">
        <Scale class="size-5 text-primary" />
        <div>
          <h3 class="font-bold text-sm text-foreground">Fair-Calling Priority Policy</h3>
          <p class="text-xs text-muted-foreground">
            Defines the number of priority tickets called before calling a regular ticket.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <Field>
          <FieldLabel for="p-ratio">Priority Turn Ratio</FieldLabel>
          <Input id="p-ratio" v-model.number="priorityRatio" type="number" min="1" max="10" required />
          <FieldDescription>Consecutive priority customers called before switching.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel for="r-ratio">Regular Turn Ratio</FieldLabel>
          <Input id="r-ratio" v-model.number="regularRatio" type="number" min="1" max="10" required />
          <FieldDescription>Standard customers called per cycle (e.g. 1).</FieldDescription>
        </Field>
      </div>

      <div class="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground flex items-center gap-2">
        <strong>Active Policy:</strong>
        <span>
          Calls <strong>{{ priorityRatio }} Priority</strong> tickets, followed by <strong>{{ regularRatio }} Regular</strong> ticket (whenever both lanes have customers waiting).
        </span>
      </div>
    </div>

    <!-- Ticket Prefixes & Numbering -->
    <div class="rounded-xl border border-border bg-card p-6 shadow-2xs space-y-4">
      <div class="flex items-center gap-2 border-b border-border pb-3">
        <Hash class="size-5 text-primary" />
        <div>
          <h3 class="font-bold text-sm text-foreground">Ticket Numbering Format</h3>
          <p class="text-xs text-muted-foreground">
            Set custom letter prefixes for the printed slips and display boards.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <Field>
          <FieldLabel for="p-prefix">Priority Prefix</FieldLabel>
          <Input id="p-prefix" v-model="prefixPriority" maxlength="3" required />
          <FieldDescription>Example: 'P' results in P-001, P-002.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel for="r-prefix">Regular Prefix</FieldLabel>
          <Input id="r-prefix" v-model="prefixRegular" maxlength="3" required />
          <FieldDescription>Example: 'R' results in R-001, R-002.</FieldDescription>
        </Field>
      </div>
    </div>

    <!-- Save Settings Button -->
    <div class="flex justify-end">
      <Button variant="default" class="cursor-pointer" @click="handleSaveSettings">
        Save Policy Settings
      </Button>
    </div>

    <!-- Danger Zone: Reset Daily Sequences -->
    <div class="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-3">
      <div class="flex items-center gap-2">
        <AlertTriangle class="size-5 text-destructive" />
        <h3 class="font-bold text-sm text-destructive">Daily Queue Maintenance</h3>
      </div>
      <p class="text-xs text-muted-foreground">
        Reset ticket counters back to sequence 001 and mark any unfinished calling tickets as completed.
        Historical audit logs and completed ticket archives remain safely intact.
      </p>

      <div class="pt-2">
        <Button variant="destructive" size="sm" class="cursor-pointer" @click="isResetDialogOpen = true">
          <RotateCcw class="size-3.5 mr-1.5" /> Reset Daily Sequences to 001
        </Button>
      </div>
    </div>

    <!-- Reset Confirmation Dialog -->
    <Dialog v-model:open="isResetDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Queue Daily Sequences?</DialogTitle>
          <DialogDescription>
            This action will reset next ticket generation numbers to P-001 and R-001. Current active counters will be set to idle.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="pt-4">
          <Button variant="outline" type="button" class="cursor-pointer" @click="isResetDialogOpen = false">
            Cancel
          </Button>
          <Button variant="destructive" class="cursor-pointer" @click="handleResetQueue">
            Confirm Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
