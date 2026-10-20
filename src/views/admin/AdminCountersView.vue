<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiRequest } from '@/services/api'
import { useQueueStore } from '@/stores/queue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Plus, Edit2, RotateCw, CheckCircle2 } from '@lucide/vue'

const queue = useQueueStore()
const counters = ref<any[]>([])
const isLoading = ref(false)
const message = ref('')

const isDialogOpen = ref(false)
const isEditing = ref(false)
const formCounterId = ref<number | null>(null)
const formName = ref('')
const formCode = ref('')
const formActive = ref(1)

onMounted(fetchCounters)

async function fetchCounters() {
  isLoading.value = true
  try {
    const res = await apiRequest<{ counters: any[] }>('/api/admin/counters')
    counters.value = res.counters
  } finally {
    isLoading.value = false
  }
}

function openAddModal() {
  isEditing.value = false
  formCounterId.value = null
  formName.value = `Table ${counters.value.length + 1}`
  formCode.value = `T${counters.value.length + 1}`
  formActive.value = 1
  isDialogOpen.value = true
}

function openEditModal(counter: any) {
  isEditing.value = true
  formCounterId.value = counter.id
  formName.value = counter.name
  formCode.value = counter.code
  formActive.value = counter.is_active
  isDialogOpen.value = true
}

async function handleSaveCounter() {
  if (!formName.value || !formCode.value) return

  if (isEditing.value && formCounterId.value) {
    await apiRequest(`/api/admin/counters/${formCounterId.value}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: formName.value,
        code: formCode.value,
        is_active: formActive.value
      })
    })
    message.value = `Counter ${formName.value} updated successfully.`
  } else {
    await apiRequest('/api/admin/counters', {
      method: 'POST',
      body: JSON.stringify({
        name: formName.value,
        code: formCode.value
      })
    })
    message.value = `Counter ${formName.value} created successfully.`
  }

  isDialogOpen.value = false
  await fetchCounters()
  await queue.fetchSnapshot()

  setTimeout(() => {
    message.value = ''
  }, 4000)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-foreground">Counter Stations Configuration</h2>
        <p class="text-xs text-muted-foreground mt-0.5">
          Configure service tables, window labels, codes, and activation states.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-9 cursor-pointer" @click="fetchCounters">
          <RotateCw class="size-3.5 mr-1.5" /> Refresh
        </Button>
        <Button variant="default" size="sm" class="h-9 cursor-pointer" @click="openAddModal">
          <Plus class="size-3.5 mr-1.5" /> Add Counter
        </Button>
      </div>
    </div>

    <Alert v-if="message" class="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 class="size-4" />
      <AlertDescription>{{ message }}</AlertDescription>
    </Alert>

    <div class="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-16">ID</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Station / Table Name</TableHead>
            <TableHead>Assigned Staff</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="c in counters" :key="c.id">
            <TableCell class="font-mono text-xs text-muted-foreground">#{{ c.id }}</TableCell>
            <TableCell>
              <span class="font-mono font-bold text-xs px-2 py-0.5 rounded bg-muted">
                {{ c.code }}
              </span>
            </TableCell>
            <TableCell class="font-semibold text-foreground">
              {{ c.name }}
            </TableCell>
            <TableCell>
              <div v-if="c.assigned_staff_name" class="text-xs">
                <span class="font-medium text-foreground">{{ c.assigned_staff_name }}</span>
                <span class="text-muted-foreground"> (@{{ c.assigned_staff_username }})</span>
              </div>
              <span v-else class="text-xs text-muted-foreground italic">None assigned</span>
            </TableCell>
            <TableCell>
              <span
                class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                :class="c.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'"
              >
                {{ c.is_active ? 'Active' : 'Disabled' }}
              </span>
            </TableCell>
            <TableCell class="text-right">
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs cursor-pointer"
                @click="openEditModal(c)"
              >
                <Edit2 class="size-3 mr-1" /> Edit
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Edit/Add Counter Modal -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? 'Edit Counter' : 'Add New Counter Station' }}</DialogTitle>
          <DialogDescription>
            Configure the name and abbreviation used for announcements and displays.
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4 py-2" @submit.prevent="handleSaveCounter">
          <FieldGroup>
            <Field>
              <FieldLabel for="c-name">Station Name</FieldLabel>
              <Input id="c-name" v-model="formName" placeholder="e.g. Table 1, Window 2" required />
            </Field>

            <Field>
              <FieldLabel for="c-code">Station Code</FieldLabel>
              <Input id="c-code" v-model="formCode" placeholder="e.g. T1, W2" required />
            </Field>

            <Field v-if="isEditing">
              <FieldLabel for="c-status">Status</FieldLabel>
              <select
                id="c-status"
                v-model.number="formActive"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-ring"
              >
                <option :value="1">Active</option>
                <option :value="0">Disabled</option>
              </select>
            </Field>
          </FieldGroup>

          <DialogFooter class="pt-4">
            <Button variant="outline" type="button" class="cursor-pointer" @click="isDialogOpen = false">
              Cancel
            </Button>
            <Button type="submit" class="cursor-pointer">
              Save Station
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
