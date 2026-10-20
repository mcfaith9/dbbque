<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiRequest } from '@/services/api'
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
import { UserPlus, Edit2, RotateCw, CheckCircle2, ShieldCheck, MonitorCheck, User } from '@lucide/vue'

const users = ref<any[]>([])
const counters = ref<any[]>([])
const isLoading = ref(false)
const notification = ref('')

const isDialogOpen = ref(false)
const isEditing = ref(false)
const formUserId = ref<number | null>(null)
const formUsername = ref('')
const formName = ref('')
const formEmail = ref('')
const formPassword = ref('')
const formRole = ref<'admin' | 'counter' | 'ticket' | 'user'>('counter')
const formCounterId = ref<number | null>(null)
const formIsActive = ref(1)

onMounted(async () => {
  await Promise.all([loadUsers(), loadCounters()])
})

async function loadUsers() {
  isLoading.value = true
  try {
    const res = await apiRequest<{ users: any[] }>('/api/admin/users')
    users.value = res.users
  } finally {
    isLoading.value = false
  }
}

async function loadCounters() {
  const res = await apiRequest<{ counters: any[] }>('/api/admin/counters')
  counters.value = res.counters
}

function openAddModal() {
  isEditing.value = false
  formUserId.value = null
  formUsername.value = ''
  formName.value = ''
  formEmail.value = ''
  formPassword.value = ''
  formRole.value = 'counter'
  formCounterId.value = counters.value[0]?.id || null
  formIsActive.value = 1
  isDialogOpen.value = true
}

function openEditModal(user: any) {
  isEditing.value = true
  formUserId.value = user.id
  formUsername.value = user.username
  formName.value = user.name
  formEmail.value = user.email || ''
  formPassword.value = ''
  formRole.value = user.role
  formCounterId.value = user.counter_id
  formIsActive.value = user.is_active
  isDialogOpen.value = true
}

async function handleSaveUser() {
  if (isEditing.value && formUserId.value) {
    await apiRequest(`/api/admin/users/${formUserId.value}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: formName.value,
        email: formEmail.value || null,
        role: formRole.value,
        counter_id: formRole.value === 'counter' ? formCounterId.value : null,
        is_active: formIsActive.value,
        password: formPassword.value || undefined
      })
    })
    notification.value = `Account ${formUsername.value} updated successfully.`
  } else {
    await apiRequest('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: formUsername.value,
        name: formName.value,
        email: formEmail.value || null,
        password: formPassword.value,
        role: formRole.value,
        counter_id: formRole.value === 'counter' ? formCounterId.value : null
      })
    })
    notification.value = `Account ${formUsername.value} created successfully.`
  }

  isDialogOpen.value = false
  await loadUsers()
  setTimeout(() => {
    notification.value = ''
  }, 4000)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-foreground">User & Counter Staff Accounts</h2>
        <p class="text-xs text-muted-foreground mt-0.5">
          Manage administrator, ticket machine, and counter staff credentials and table assignments.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-9 cursor-pointer" @click="loadUsers">
          <RotateCw class="size-3.5 mr-1.5" /> Refresh
        </Button>
        <Button variant="default" size="sm" class="h-9 cursor-pointer" @click="openAddModal">
          <UserPlus class="size-3.5 mr-1.5" /> Add Staff Account
        </Button>
      </div>
    </div>

    <Alert v-if="notification" class="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 class="size-4" />
      <AlertDescription>{{ notification }}</AlertDescription>
    </Alert>

    <div class="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-16">ID</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Full Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Assigned Station</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="u in users" :key="u.id">
            <TableCell class="font-mono text-xs text-muted-foreground font-medium">#{{ u.id }}</TableCell>
            <TableCell class="font-mono font-bold text-xs text-foreground">
              @{{ u.username }}
            </TableCell>
            <TableCell class="font-medium text-xs">
              {{ u.name }}
            </TableCell>
            <TableCell>
              <span
                class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                :class="{
                  'bg-primary text-primary-foreground': u.role === 'admin',
                  'bg-blue-500/10 text-blue-600': u.role === 'counter',
                  'bg-amber-500/10 text-amber-600': u.role === 'ticket',
                  'bg-muted text-muted-foreground': u.role === 'user',
                }"
              >
                <ShieldCheck v-if="u.role === 'admin'" class="size-3" />
                <MonitorCheck v-else-if="u.role === 'counter'" class="size-3" />
                <User v-else class="size-3" />
                {{ u.role }}
              </span>
            </TableCell>
            <TableCell class="text-xs">
              <span v-if="u.counter_name" class="font-semibold text-foreground">
                {{ u.counter_name }}
              </span>
              <span v-else class="text-muted-foreground italic">None</span>
            </TableCell>
            <TableCell>
              <span
                class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                :class="u.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'"
              >
                {{ u.is_active ? 'Active' : 'Disabled' }}
              </span>
            </TableCell>
            <TableCell class="text-right">
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs cursor-pointer"
                @click="openEditModal(u)"
              >
                <Edit2 class="size-3 mr-1" /> Edit / Reset
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Account Edit / Add Dialog -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? `Edit User @${formUsername}` : 'Create New Account' }}</DialogTitle>
          <DialogDescription>
            Assign account credentials, operational roles, and counter table associations.
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4 py-2" @submit.prevent="handleSaveUser">
          <FieldGroup>
            <Field v-if="!isEditing">
              <FieldLabel for="u-uname">Username</FieldLabel>
              <Input id="u-uname" v-model="formUsername" placeholder="e.g. account09" required />
            </Field>

            <Field>
              <FieldLabel for="u-name">Full Name</FieldLabel>
              <Input id="u-name" v-model="formName" placeholder="e.g. Counter Staff 9" required />
            </Field>

            <Field>
              <FieldLabel for="u-email">Email (Optional)</FieldLabel>
              <Input id="u-email" v-model="formEmail" type="email" placeholder="staff@example.com" />
            </Field>

            <Field>
              <FieldLabel for="u-pass">
                {{ isEditing ? 'Change Password (leave empty to keep current)' : 'Password' }}
              </FieldLabel>
              <Input
                id="u-pass"
                v-model="formPassword"
                type="password"
                :required="!isEditing"
                placeholder="••••••••"
              />
            </Field>

            <div class="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel for="u-role">Role</FieldLabel>
                <select
                  id="u-role"
                  v-model="formRole"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus:ring-1 focus:ring-ring"
                >
                  <option value="counter">Counter Staff</option>
                  <option value="ticket">Ticket Kiosk</option>
                  <option value="admin">Administrator</option>
                  <option value="user">Standard User</option>
                </select>
              </Field>

              <Field v-if="formRole === 'counter'">
                <FieldLabel for="u-counter">Assigned Table</FieldLabel>
                <select
                  id="u-counter"
                  v-model.number="formCounterId"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus:ring-1 focus:ring-ring"
                >
                  <option :value="null">Unassigned</option>
                  <option v-for="c in counters" :key="c.id" :value="c.id">
                    {{ c.name }} ({{ c.code }})
                  </option>
                </select>
              </Field>

              <Field v-if="isEditing">
                <FieldLabel for="u-status">Account Status</FieldLabel>
                <select
                  id="u-status"
                  v-model.number="formIsActive"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus:ring-1 focus:ring-ring"
                >
                  <option :value="1">Active</option>
                  <option :value="0">Disabled</option>
                </select>
              </Field>
            </div>
          </FieldGroup>

          <DialogFooter class="pt-4">
            <Button variant="outline" type="button" class="cursor-pointer" @click="isDialogOpen = false">
              Cancel
            </Button>
            <Button type="submit" class="cursor-pointer">
              {{ isEditing ? 'Save Changes' : 'Create Account' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
