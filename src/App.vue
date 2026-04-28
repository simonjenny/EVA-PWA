<script setup>
import { watch, onMounted } from 'vue'
import BottomNav from './components/BottomNav.vue'
import { useSettingsStore } from './stores/settings.js'

const store = useSettingsStore()

function applyDarkMode(val) {
  document.documentElement.classList.toggle('dark', val)
}

onMounted(() => applyDarkMode(store.darkMode))
watch(() => store.darkMode, applyDarkMode)
</script>

<template>
  <div id="app-shell">
    <main class="bg-ios-gray dark:bg-ios-dark-bg" style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 52px);">
      <router-view />
    </main>
    <BottomNav />
  </div>
</template>
