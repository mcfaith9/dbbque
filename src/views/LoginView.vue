<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useQueueStore, type CounterInfo } from '@/stores/queue'
import { isSocketConnected } from '@/services/socket'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  AlertCircle,
  KeyRound,
  X,
  Delete,
  Clock,
  Sparkles
} from '@lucide/vue'

const router = useRouter()
const auth = useAuthStore()
const queue = useQueueStore()

const selectingTableId = ref<number | null>(null)
const tableError = ref<string | null>(null)

// Admin PIN Modal State
const isAdminModalOpen = ref(false)
const adminPin = ref('')
const adminPinError = ref<string | null>(null)
const isAdminSubmitting = ref(false)
const usePasswordFallback = ref(false)
const adminUsername = ref('admin')
const adminPassword = ref('')

onMounted(async () => {
  queue.initSocket({ enableSpeech: false })
  await queue.fetchSnapshot().catch(() => {})
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// Tables 1 through 8 data
const tables = computed(() => {
  const list: { id: number; name: string; code: string; counter?: CounterInfo }[] = []
  for (let i = 1; i <= 8; i++) {
    const counter = queue.counters.find(c => c.id === i)
    list.push({
      id: i,
      name: counter?.name || `Table ${i}`,
      code: counter?.code || `T${i}`,
      counter
    })
  }
  return list
})

// Table selection without credentials
async function handleSelectTable(tableId: number) {
  tableError.value = null
  selectingTableId.value = tableId

  try {
    await auth.tableLogin(tableId)
    router.push(`/counter?table=${tableId}`)
  } catch (err: any) {
    tableError.value = err.message || `Unable to access Table ${tableId}`
  } finally {
    selectingTableId.value = null
  }
}

// Admin PIN modal controls
function openAdminModal() {
  adminPin.value = ''
  adminPinError.value = null
  usePasswordFallback.value = false
  adminPassword.value = ''
  isAdminModalOpen.value = true
}

function closeAdminModal() {
  isAdminModalOpen.value = false
  adminPin.value = ''
  adminPinError.value = null
}

function appendPinDigit(digit: string) {
  if (adminPin.value.length < 8) {
    adminPin.value += digit
    adminPinError.value = null
  }
}

function deletePinDigit() {
  if (adminPin.value.length > 0) {
    adminPin.value = adminPin.value.slice(0, -1)
    adminPinError.value = null
  }
}

function clearPin() {
  adminPin.value = ''
  adminPinError.value = null
}

async function submitAdminPin() {
  if (!adminPin.value) {
    adminPinError.value = 'Please enter the Admin PIN'
    return
  }

  isAdminSubmitting.value = true
  adminPinError.value = null

  try {
    await auth.adminPinLogin(adminPin.value)
    closeAdminModal()
    router.push('/admin/queue')
  } catch (err: any) {
    adminPinError.value = err.message || 'Invalid Admin PIN. Please try again.'
    adminPin.value = ''
  } finally {
    isAdminSubmitting.value = false
  }
}

async function submitAdminPassword() {
  if (!adminUsername.value || !adminPassword.value) {
    adminPinError.value = 'Username and password are required'
    return
  }

  isAdminSubmitting.value = true
  adminPinError.value = null

  try {
    const user = await auth.login(adminUsername.value, adminPassword.value)
    closeAdminModal()
    router.push(auth.getDefaultRoute(user.role))
  } catch (err: any) {
    adminPinError.value = err.message || 'Login failed. Please check credentials.'
  } finally {
    isAdminSubmitting.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!isAdminModalOpen.value || usePasswordFallback.value) return

  if (e.key >= '0' && e.key <= '9') {
    appendPinDigit(e.key)
  } else if (e.key === 'Backspace') {
    deletePinDigit()
  } else if (e.key === 'Enter') {
    submitAdminPin()
  } else if (e.key === 'Escape') {
    closeAdminModal()
  }
}
</script>

<template>
  <div
      class="min-h-screen bg-cover bg-center bg-no-repeat text-white"
      style="background: #0F2027; background: linear-gradient(180deg, #0F2027 0%, #2C5364 100%);"
    >
    <!-- Main Content Container -->
    <main class="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col justify-center">
      <!-- Minimalist Header -->
      <div class="mb-8 text-center sm:text-left border-b border-zinc-850 pb-6">
        <h2 class="text-1xl font-semibold tracking-tight text-zinc-100">
          Select Terminal
        </h2>
        <p class="text-sm text-zinc-400 mt-1">
          Choose a table to open its ordering station.
        </p>
      </div>

      <!-- Error Banner if any -->
      <Alert v-if="tableError" variant="destructive" class="mb-6 border-red-900/60 bg-red-950/40 text-red-200">
        <AlertCircle class="size-4 text-red-400" />
        <AlertTitle class="text-xs font-semibold">Terminal Notice</AlertTitle>
        <AlertDescription class="text-xs">{{ tableError }}</AlertDescription>
      </Alert>

      <!-- Exactly 9 Clickable Cards in a Balanced 3x3 Grid (Desktop) and Responsive 1-2 Col (Mobile) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        <!-- Cards 1 through 8: Table 1 to Table 8 -->
        <button
          v-for="item in tables"
          :key="item.id"
          type="button"
          class="group relative rounded-xl border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-850/90 active:bg-zinc-800 hover:border-zinc-700 transition-all duration-150 p-5 flex flex-col justify-between text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 select-none shadow-xs"
          :disabled="selectingTableId === item.id"
          @click="handleSelectTable(item.id)"
        >
          <!-- Top Row: Code + Name + Status -->
          <div>
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="size-10 rounded-lg bg-zinc-800 border border-zinc-700/60 text-zinc-200 flex items-center justify-center font-bold text-sm tracking-tight group-hover:bg-zinc-750 group-hover:text-white transition-colors">
                  {{ item.code }}
                </div>
                <div>
                  <h3 class="text-base font-semibold text-zinc-100 group-hover:text-white transition-colors">
                    {{ item.name }}
                  </h3>
                  <span class="text-xs text-zinc-500">Station #{{ item.id }}</span>
                </div>
              </div>

              <!-- Compact Status Pill -->
              <span
                v-if="item.counter?.current_ticket"
                class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md border"
                :class="item.counter.current_ticket.status === 'serving'
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'bg-zinc-850 text-zinc-300 border-zinc-750'"
              >
                <span
                  class="size-1.5 rounded-full"
                  :class="item.counter.current_ticket.status === 'serving' ? 'bg-emerald-400' : 'bg-blue-400'"
                ></span>
                {{ item.counter.current_ticket.status }}
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-850 text-zinc-400 border border-zinc-800"
              >
                Ready
              </span>
            </div>
          </div>

          <!-- Bottom Action Cue -->
          <div class="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
            <span>{{ selectingTableId === item.id ? 'Opening...' : 'Open Terminal' }}</span>
            <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-1" />
          </div>
        </button>

        <!-- Card 9: Admin (Subtly distinguished with Shield / Lock Icon) -->
        <button
          type="button"
          class="group relative rounded-xl border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-850/90 active:bg-zinc-800 hover:border-zinc-700 transition-all duration-150 p-5 flex flex-col justify-between text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 select-none shadow-xs"
          @click="openAdminModal"
        >
          <!-- Top Row: Icon + Title + Status -->
          <div>
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="size-10 rounded-lg bg-zinc-800 border border-zinc-700/60 text-zinc-200 flex items-center justify-center font-bold text-sm tracking-tight group-hover:bg-zinc-750 group-hover:text-white transition-colors">
                  <ShieldCheck class="size-5" />
                </div>
                <div>
                  <h3 class="text-base font-semibold text-zinc-100 group-hover:text-white transition-colors">
                    Admin
                  </h3>
                  <span class="text-xs text-zinc-500">Management &bull; Role</span>
                </div>
              </div>

              <!-- PIN Protected Badge -->
              <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-850 text-zinc-400 border border-zinc-800">
                <Lock class="size-2.5 text-zinc-400" />
                PIN
              </span>
            </div>
          </div>

          <!-- Bottom Action Cue -->
          <div class="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
            <span>Admin Access</span>
            <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      </div>

      <div class="mt-2 text-center sm:text-left pt-6">
        <h2 class="text-1xl font-semibold tracking-tight text-zinc-100">
          Visayan Electric
        </h2>
        <span class="text-xs text-white/60">
          version 0.0.1 | Crafted with <span class="text-rose-400">♥</span> by Marc Louie (DBB IT)
        </span>
      </div>
    </main>

    <!-- Admin PIN Entry Modal Dialog (Neutral Minimalist Theme) -->
    <div
      v-if="isAdminModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-100"
      @click.self="closeAdminModal"
    >
      <div class="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl relative text-center">
        <!-- Close Button -->
        <button
          type="button"
          class="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          @click="closeAdminModal"
        >
          <X class="size-5" />
        </button>

        <!-- Icon Header -->
        <div class="inline-flex items-center justify-center size-10 rounded-xl bg-zinc-800 border border-zinc-700/60 text-zinc-200 mb-3">
          <Lock class="size-5" />
        </div>

        <h3 class="text-lg font-semibold text-zinc-100 tracking-tight">
          Admin Authentication
        </h3>
        <p class="text-xs text-zinc-400 mt-1 mb-5">
          Enter your 4-digit PIN to access administrative functions.
        </p>

        <!-- Error Notification Banner -->
        <Alert v-if="adminPinError" variant="destructive" class="mb-4 py-2 border-red-900/60 bg-red-950/40 text-red-200 text-left">
          <AlertCircle class="size-4 text-red-400" />
          <AlertTitle class="text-xs font-semibold">Access Denied</AlertTitle>
          <AlertDescription class="text-xs">{{ adminPinError }}</AlertDescription>
        </Alert>

        <!-- Mode 1: Numeric PIN Pad -->
        <div v-if="!usePasswordFallback" class="flex flex-col gap-4">
          <!-- Visual PIN Dots -->
          <div class="flex items-center justify-center gap-3 py-3 bg-zinc-950 rounded-xl border border-zinc-800">
            <div
              v-for="i in 4"
              :key="i"
              class="size-3 rounded-full transition-all duration-150"
              :class="adminPin.length >= i ? 'bg-zinc-100 scale-110' : 'bg-zinc-800'"
            ></div>
          </div>

          <!-- Numeric Keypad Grid -->
          <div class="grid grid-cols-3 gap-2 text-base font-medium pt-1">
            <button
              v-for="digit in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
              :key="digit"
              type="button"
              class="h-11 rounded-lg bg-zinc-850 hover:bg-zinc-800 active:bg-zinc-750 text-zinc-100 border border-zinc-750/70 transition-all flex items-center justify-center cursor-pointer select-none"
              @click="appendPinDigit(digit)"
            >
              {{ digit }}
            </button>

            <!-- Clear Button -->
            <button
              type="button"
              class="h-11 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-400 border border-zinc-800 text-xs uppercase font-semibold tracking-wider cursor-pointer"
              @click="clearPin"
            >
              Clear
            </button>

            <!-- Zero Button -->
            <button
              type="button"
              class="h-11 rounded-lg bg-zinc-850 hover:bg-zinc-800 active:bg-zinc-750 text-zinc-100 border border-zinc-750/70 transition-all flex items-center justify-center cursor-pointer select-none"
              @click="appendPinDigit('0')"
            >
              0
            </button>

            <!-- Backspace Button -->
            <button
              type="button"
              class="h-11 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-400 border border-zinc-800 flex items-center justify-center cursor-pointer"
              @click="deletePinDigit"
            >
              <Delete class="size-4" />
            </button>
          </div>

          <!-- Submit Button -->
          <Button
            class="w-full mt-2 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold py-2.5 rounded-xl cursor-pointer transition-colors shadow-xs"
            :disabled="isAdminSubmitting || adminPin.length === 0"
            @click="submitAdminPin"
          >
            <span v-if="isAdminSubmitting">Verifying...</span>
            <span v-else class="flex items-center justify-center gap-1.5">
              <KeyRound class="size-4" /> Unlock Admin
            </span>
          </Button>

          <!-- Toggle to Username/Password Fallback -->
          <button
            type="button"
            class="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-4 cursor-pointer mt-1"
            @click="usePasswordFallback = true"
          >
            Log in with username & password
          </button>
        </div>

        <!-- Mode 2: Username & Password Fallback -->
        <form v-else class="flex flex-col gap-3 text-left" @submit.prevent="submitAdminPassword">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Username</label>
            <input
              v-model="adminUsername"
              type="text"
              class="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
              placeholder="admin"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Password</label>
            <input
              v-model="adminPassword"
              type="password"
              class="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
              placeholder="••••••••"
              required
              autofocus
            />
          </div>

          <Button
            type="submit"
            class="w-full mt-2 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold py-2.5 rounded-lg cursor-pointer transition-colors"
            :disabled="isAdminSubmitting"
          >
            <span v-if="isAdminSubmitting">Signing in...</span>
            <span v-else>Login as Admin</span>
          </Button>

          <button
            type="button"
            class="text-xs text-center text-zinc-400 hover:text-zinc-200 underline underline-offset-4 cursor-pointer mt-1"
            @click="usePasswordFallback = false"
          >
            Back to PIN Entry
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
