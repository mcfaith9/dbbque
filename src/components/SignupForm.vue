<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import type { HTMLAttributes } from "vue"
import { cn } from "cn"
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuthStore } from '@/stores/auth'
import { AlertCircle, MonitorCheck } from '@lucide/vue'

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()

const router = useRouter()
const auth = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function handleSignup() {
  errorMessage.value = ''
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match'
    return
  }
  if (password.value.length < 6) {
    errorMessage.value = 'Password must be at least 6 characters long'
    return
  }

  isSubmitting.value = true
  try {
    const user = await auth.signup(name.value, email.value, password.value)
    router.push(auth.getDefaultRoute(user.role))
  } catch (err: any) {
    errorMessage.value = err.message || 'Registration failed'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form :class="cn('flex flex-col gap-6', props.class)" @submit.prevent="handleSignup">
    <FieldGroup>
      <div class="flex flex-col items-center gap-1 text-center">
        <div class="inline-flex items-center justify-center size-10 rounded-xl bg-primary text-primary-foreground mb-2 shadow-xs">
          <MonitorCheck class="size-5" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight">
          Create an account
        </h1>
        <p class="text-muted-foreground text-sm text-balance">
          Sign up to access your queue terminal
        </p>
      </div>

      <Alert v-if="errorMessage" variant="destructive">
        <AlertCircle class="size-4" />
        <AlertTitle>Registration Notice</AlertTitle>
        <AlertDescription>{{ errorMessage }}</AlertDescription>
      </Alert>

      <Field>
        <FieldLabel for="name">
          Full Name
        </FieldLabel>
        <Input id="name" v-model="name" type="text" placeholder="John Doe" required />
      </Field>

      <Field>
        <FieldLabel for="email">
          Email Address
        </FieldLabel>
        <Input id="email" v-model="email" type="email" placeholder="m@example.com" required />
        <FieldDescription>
          Used for identification and notifications.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel for="password">
          Password
        </FieldLabel>
        <Input id="password" v-model="password" type="password" required />
        <FieldDescription>
          Must be at least 6 characters long.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel for="confirm-password">
          Confirm Password
        </FieldLabel>
        <Input id="confirm-password" v-model="confirmPassword" type="password" required />
      </Field>

      <div class="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        <strong>Note:</strong> Public registrations receive standard access. Administrative roles and Counter table assignments are granted by the system administrator.
      </div>

      <Field>
        <Button type="submit" class="w-full" :disabled="isSubmitting">
          <span v-if="isSubmitting">Creating account...</span>
          <span v-else>Create Account</span>
        </Button>
      </Field>

      <FieldDescription class="px-6 text-center">
        Already have an account?
        <RouterLink to="/login" class="font-medium underline underline-offset-4 hover:text-primary">
          Sign in
        </RouterLink>
      </FieldDescription>
    </FieldGroup>
  </form>
</template>
