import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    redirect: () => {
      const auth = useAuthStore()
      if (auth.isAuthenticated) {
        return auth.getDefaultRoute()
      }
      return '/login'
    }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { isHub: true }
  },
  {
    path: '/signup',
    name: 'Signup',
    component: () => import('@/views/SignupView.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/ticket',
    name: 'TicketMachine',
    component: () => import('@/views/TicketMachineView.vue'),
    meta: { isKiosk: true }
  },
  {
    path: '/counter',
    name: 'CounterDashboard',
    component: () => import('@/views/CounterDashboardView.vue'),
    meta: { requiresAuth: true, roles: ['counter', 'admin'] }
  },
  {
    path: '/display',
    name: 'PublicDisplay',
    component: () => import('@/views/PublicDisplayView.vue'),
    meta: { isPublicDisplay: true }
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, roles: ['admin'] },
    children: [
      {
        path: '',
        redirect: '/admin/queue'
      },
      {
        path: 'queue',
        name: 'AdminQueue',
        component: () => import('@/views/admin/AdminQueueView.vue')
      },
      {
        path: 'counters',
        name: 'AdminCounters',
        component: () => import('@/views/admin/AdminCountersView.vue')
      },
      {
        path: 'history',
        name: 'AdminHistory',
        component: () => import('@/views/admin/AdminHistoryView.vue')
      },
      {
        path: 'accounts',
        name: 'AdminAccounts',
        component: () => import('@/views/admin/AdminAccountsView.vue')
      },
      {
        path: 'settings',
        name: 'AdminSettings',
        component: () => import('@/views/admin/AdminSettingsView.vue')
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()

  // Verify session on first navigation if token exists
  if (auth.token && !auth.user) {
    await auth.fetchCurrentUser()
  }

  // Auto-init kiosk session if accessing /ticket directly
  if (to.path === '/ticket' && !auth.isAuthenticated) {
    try {
      await auth.kioskLogin()
      return next()
    } catch {
      // continue
    }
  }

  // Guest-only routes (e.g. signup)
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return next(auth.getDefaultRoute())
  }

  // Protected routes
  if (to.meta.requiresAuth) {
    if (!auth.isAuthenticated) {
      return next({ path: '/login', query: { redirect: to.fullPath } })
    }

    const allowedRoles = to.meta.roles as string[] | undefined
    if (allowedRoles && auth.role && !allowedRoles.includes(auth.role)) {
      // Role not allowed, redirect to authorized home
      return next(auth.getDefaultRoute())
    }
  }

  next()
})

export default router
