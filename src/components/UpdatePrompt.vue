<script setup>
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { needRefresh, updateServiceWorker } = useRegisterSW()

async function doUpdate() {
  await updateServiceWorker(true)
}
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-300 ease-out"
    enter-from-class="-translate-y-full"
    enter-to-class="translate-y-0"
    leave-active-class="transition-transform duration-200 ease-in"
    leave-from-class="translate-y-0"
    leave-to-class="-translate-y-full"
  >
    <div
      v-if="needRefresh"
      class="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-3 bg-blue-600 text-white shadow-lg"
      style="padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem);"
    >
      <span class="text-sm font-medium">Neue Version verfügbar ✓</span>
      <button
        @click="doUpdate"
        class="shrink-0 rounded-full bg-white text-blue-600 text-sm font-semibold px-4 py-1 active:opacity-70"
      >
        Aktualisieren
      </button>
    </div>
  </Transition>
</template>
