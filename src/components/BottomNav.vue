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
        <!-- Abfahrtstafel -->
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="20" height="18" rx="2.5" stroke="currentColor" stroke-width="1.6"/>
          <rect x="2" y="3" width="20" height="5.5" rx="2.5" stroke="currentColor" stroke-width="1.6"/>
          <!-- Row 1: badge + line -->
          <rect x="4.5" y="10" width="4" height="3" rx="0.75" fill="currentColor" opacity="0.85"/>
          <rect x="10" y="10.75" width="7.5" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
          <!-- Row 2: badge + line -->
          <rect x="4.5" y="15" width="4" height="3" rx="0.75" fill="currentColor" opacity="0.85"/>
          <rect x="10" y="15.75" width="5.5" height="1.5" rx="0.75" fill="currentColor" opacity="0.5"/>
        </svg>
        <span class="text-[11px] font-medium">Abfahrten</span>
      </router-link>

      <router-link
        to="/assistant"
        class="flex flex-col items-center justify-center flex-1 h-[46px] gap-0.5 transition-colors"
        :class="route.path === '/assistant' ? 'text-ios-blue' : 'text-ios-secondary'"
      >
        <!-- ÖV-Assistent Chat -->
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 3H4C2.9 3 2 3.9 2 5v11c0 1.1.9 2 2 2h4l3 3 3-3h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <circle cx="8" cy="11" r="1.1" fill="currentColor"/>
          <circle cx="12" cy="11" r="1.1" fill="currentColor"/>
          <circle cx="16" cy="11" r="1.1" fill="currentColor"/>
        </svg>
        <span class="text-[11px] font-medium">ÖV-Assistent</span>
      </router-link>

      <router-link
        to="/trip"
        class="flex flex-col items-center justify-center flex-1 h-[46px] gap-0.5 transition-colors"
        :class="route.path === '/trip' ? 'text-ios-blue' : 'text-ios-secondary'"
      >
        <!-- Bus mit geschwungener Route -->
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Startpunkt -->
          <circle cx="2.5" cy="18.5" r="1.75" stroke="currentColor" stroke-width="1.5"/>
          <!-- Geschwungene Route -->
          <path d="M4 18C5 14 2 10 6 8C10 6 10 11 14 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2.5 2"/>
          <!-- Bus -->
          <rect x="13.5" y="4" width="8.5" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M13.5 7.5h8.5" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="15.5" cy="12" r="1.1" fill="currentColor"/>
          <circle cx="20" cy="12" r="1.1" fill="currentColor"/>
          <path d="M15.5 4V3M20 4V3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <span class="text-[11px] font-medium">Reiseplaner</span>
      </router-link>

      <router-link
        to="/settings"
        class="flex flex-col items-center justify-center flex-1 h-[46px] gap-0.5 transition-colors"
        :class="route.path === '/settings' ? 'text-ios-blue' : 'text-ios-secondary'"
      >
        <!-- Sliders / Tune -->
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          <circle cx="9" cy="6" r="2.25" stroke="currentColor" stroke-width="1.75"/>
          <circle cx="16" cy="12" r="2.25" stroke="currentColor" stroke-width="1.75"/>
          <circle cx="8" cy="18" r="2.25" stroke="currentColor" stroke-width="1.75"/>
        </svg>
        <span class="text-[11px] font-medium">Einstellungen</span>
      </router-link>
    </div>
  </nav>
</template>
