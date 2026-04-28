<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <nav
    class="bg-white dark:bg-ios-dark-card border-t border-ios-separator dark:border-ios-dark-separator"
    style="position:fixed;bottom:0;left:0;right:0;height:70px;padding-bottom:env(safe-area-inset-bottom, 0px);z-index:100;"
  >
    <div class="flex pt-3">
      <router-link
        to="/"
        class="flex flex-col items-center justify-center flex-1 h-[46px] gap-0.5 transition-colors"
        :class="route.path === '/' ? 'text-ios-blue' : 'text-ios-secondary'"
      >
        <!-- Abfahrten Icon (Uhr) -->
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.75"/>
          <path d="M12 7.5V12L15 14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="text-[11px] font-medium">Abfahrten</span>
      </router-link>

      <router-link
        to="/settings"
        class="flex flex-col items-center justify-center flex-1 h-[46px] gap-0.5 transition-colors"
        :class="route.path === '/settings' ? 'text-ios-blue' : 'text-ios-secondary'"
      >
        <!-- Einstellungen Icon (Zahnrad) -->
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.75"/>
          <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        </svg>
        <span class="text-[11px] font-medium">Einstellungen</span>
      </router-link>
    </div>
  </nav>
</template>
