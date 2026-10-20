<script setup lang="ts">
import { ExternalLink } from "@lucide/vue"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

defineProps<{
  projects: {
    name: string
    url: string
    icon: any
  }[]
}>()
</script>

<template>
  <SidebarGroup class="group-data-[collapsible=icon]:hidden">
    <SidebarGroupLabel>Portals & Displays</SidebarGroupLabel>
    <SidebarMenu>
      <SidebarMenuItem v-for="item in projects" :key="item.name">
        <SidebarMenuButton as-child>
          <a :href="item.url" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <component :is="item.icon" class="size-4" />
              <span>{{ item.name }}</span>
            </div>
            <ExternalLink class="size-3 text-muted-foreground opacity-70" />
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarGroup>
</template>
