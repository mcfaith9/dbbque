<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import type { HTMLAttributes } from "vue"
import { cn } from "cn"
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuthStore } from '@/stores/auth'
import { AlertCircle, User, Tv, ShieldCheck, MonitorCheck } from '@lucide/vue'

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function handleLogin() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    const user = await auth.login(username.value, password.value)
    const redirectUrl = (route.query.redirect as string) || auth.getDefaultRoute(user.role)
    router.push(redirectUrl)
  } catch (err: any) {
    errorMessage.value = err.message || 'Login failed. Please verify credentials.'
  } finally {
    isSubmitting.value = false
  }
}

function quickFill(u: string, p: string) {
  username.value = u
  password.value = p
}
</script>

<template>
  <form :class="cn('flex flex-col gap-6', props.class)" @submit.prevent="handleLogin">
    <FieldGroup>
      <div class="flex flex-col items-center gap-1 text-center">
        <div class="inline-flex items-center justify-center size-10 rounded-xl bg-primary text-primary-foreground mb-2 shadow-xs">
          <MonitorCheck class="size-5" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight">
          Login to your account
        </h1>
        <p class="text-muted-foreground text-sm text-balance">
          Enter your username or email below to access your queue terminal
        </p>
      </div>

      <Alert v-if="errorMessage" variant="destructive">
        <AlertCircle class="size-4" />
        <AlertTitle>Authentication Error</AlertTitle>
        <AlertDescription>{{ errorMessage }}</AlertDescription>
      </Alert>

      <Field>
        <FieldLabel for="username">
          Username or Email
        </FieldLabel>
        <Input
          id="username"
          v-model="username"
          type="text"
          placeholder="admin, ticket01, or account01"
          required
          autofocus
        />
      </Field>

      <Field>
        <div class="flex items-center">
          <FieldLabel for="password">
            Password
          </FieldLabel>
        </div>
        <Input
          id="password"
          v-model="password"
          type="password"
          placeholder="••••••••"
          required
        />
      </Field>

      <Field>
        <Button type="submit" class="w-full" :disabled="isSubmitting">
          <span v-if="isSubmitting">Signing in...</span>
          <span v-else>Login</span>
        </Button>
      </Field>

      <FieldSeparator>Demo Credentials</FieldSeparator>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          class="flex flex-col items-start p-2.5 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors cursor-pointer"
          @click="quickFill('admin', 'admin123')"
        >
          <span class="font-semibold text-foreground flex items-center gap-1">
            <ShieldCheck class="size-3.5 text-primary" /> Admin
          </span>
          <span class="text-muted-foreground mt-0.5">admin / admin123</span>
        </button>

        <button
          type="button"
          class="flex flex-col items-start p-2.5 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors cursor-pointer"
          @click="quickFill('ticket01', 'ticket123')"
        >
          <span class="font-semibold text-foreground flex items-center gap-1">
            <MonitorCheck class="size-3.5 text-primary" /> Ticket Kiosk
          </span>
          <span class="text-muted-foreground mt-0.5">ticket01 / ticket123</span>
        </button>

        <button
          type="button"
          class="flex flex-col items-start p-2.5 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors cursor-pointer"
          @click="quickFill('account01', 'counter123')"
        >
          <span class="font-semibold text-foreground flex items-center gap-1">
            <User class="size-3.5 text-primary" /> Counter 1
          </span>
          <span class="text-muted-foreground mt-0.5">account01 / counter123</span>
        </button>

        <button
          type="button"
          class="flex flex-col items-start p-2.5 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors cursor-pointer"
          @click="quickFill('account02', 'counter123')"
        >
          <span class="font-semibold text-foreground flex items-center gap-1">
            <User class="size-3.5 text-primary" /> Counter 2
          </span>
          <span class="text-muted-foreground mt-0.5">account02 / counter123</span>
        </button>
      </div>

      <div class="pt-2 text-center">
        <RouterLink
          to="/display"
          target="_blank"
          class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          <Tv class="size-3.5" /> Open Public Display Monitor
        </RouterLink>
      </div>

      <FieldDescription class="text-center pt-2">
        Don't have an account?
        <RouterLink to="/signup" class="font-medium underline underline-offset-4 hover:text-primary">
          Sign up
        </RouterLink>
      </FieldDescription>
    </FieldGroup>
  </form>
</template>
