<script setup lang="ts">
import { computed } from 'vue'
import type { SidebarProps } from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth'

import {
  LayoutDashboard,
  SlidersHorizontal,
  History,
  Users2,
  Settings,
  Tv,
  Printer,
  MonitorCheck,
  LifeBuoy
} from "@lucide/vue"

import NavMain from '@/components/NavMain.vue'
import NavProjects from '@/components/NavProjects.vue'
import NavSecondary from '@/components/NavSecondary.vue'
import NavUser from '@/components/NavUser.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const props = withDefaults(defineProps<SidebarProps>(), {
  variant: "inset",
})

const auth = useAuthStore()

const userData = computed(() => ({
  name: auth.user?.name || "Administrator",
  email: auth.user?.email || "admin@example.com",
  avatar: "/favicon.svg",
}))

const navMain = [
  {
    title: "Queue Overview",
    url: "/admin/queue",
    icon: LayoutDashboard,
    isActive: true,
  },
  {
    title: "Counters & Tables",
    url: "/admin/counters",
    icon: SlidersHorizontal,
  },
  {
    title: "History & Logs",
    url: "/admin/history",
    icon: History,
  },
  {
    title: "Staff Accounts",
    url: "/admin/accounts",
    icon: Users2,
  },
  {
    title: "Queue Settings",
    url: "/admin/settings",
    icon: Settings,
  },
]

const externalPortals = [
  {
    name: "Public Display (TV)",
    url: "/display",
    icon: Tv,
  },
  {
    name: "Ticket Dispenser Kiosk",
    url: "/ticket",
    icon: Printer,
  },
  {
    name: "Staff Counter Terminal",
    url: "/counter",
    icon: MonitorCheck,
  },
]

const secondaryItems = [
  {
    title: "System Status: Online",
    url: "#",
    icon: LifeBuoy,
  },
]
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <RouterLink to="/admin/queue">
              <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-black">
                Q
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-bold tracking-tight">dbbque</span>
                <span class="truncate text-xs text-muted-foreground">Admin Console</span>
              </div>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="navMain" />
      <NavProjects :projects="externalPortals" />
      <NavSecondary :items="secondaryItems" class="mt-auto" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="userData" />
    </SidebarFooter>
  </Sidebar>
</template>
