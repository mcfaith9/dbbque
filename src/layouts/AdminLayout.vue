<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { useQueueStore } from '@/stores/queue'
import { isSocketConnected } from '@/services/socket'
import { Tv, Printer } from '@lucide/vue'

const route = useRoute()
const queue = useQueueStore()

onMounted(() => {
  queue.initSocket({ enableSpeech: false })
  queue.fetchSnapshot().catch(() => {})
})

function launchDisplay() {
  window.open('/display', '_blank', 'noopener,noreferrer')
}

function openKiosk() {
  window.open('/ticket', '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 bg-card">
        <div class="flex items-center gap-2">
          <SidebarTrigger class="-ml-1" />
          <Separator orientation="vertical" class="mr-2 h-4" />
          <div class="flex items-center gap-2 text-sm">
            <span class="font-semibold text-foreground">Queue Management System</span>
            <span class="text-muted-foreground hidden sm:inline">/</span>
            <span class="text-muted-foreground capitalize hidden sm:inline">
              {{ String(route.name || '').replace('Admin', '') }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <div class="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground">
            <span class="size-2 rounded-full" :class="isSocketConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'"></span>
            <span>{{ isSocketConnected ? 'Live Sync' : 'Connecting' }}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            class="text-xs h-8 cursor-pointer hidden sm:inline-flex"
            @click="openKiosk"
          >
            <Printer class="size-3.5 mr-1.5" /> Ticket Kiosk
          </Button>

          <!-- Launch Display action button -->
          <Button
            variant="default"
            size="sm"
            class="text-xs h-8 bg-primary text-primary-foreground font-semibold cursor-pointer shadow-xs"
            @click="launchDisplay"
          >
            <Tv class="size-3.5 mr-1.5" /> Launch Display
          </Button>
        </div>
      </header>

      <div class="flex flex-1 flex-col gap-4 p-4 md:p-6 bg-muted/20 overflow-y-auto">
        <RouterView />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
