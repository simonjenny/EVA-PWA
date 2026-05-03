<script setup>
import { watch, onMounted, ref } from 'vue'
import BottomNav from './components/BottomNav.vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import { useSettingsStore } from './stores/settings.js'
import { useRouter, useRoute } from 'vue-router'

const store = useSettingsStore()
const router = useRouter()
const route = useRoute()
const mainEl = ref(null)

watch(() => route.path, () => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      if (mainEl.value) mainEl.value.scrollTop = 0
    })
  })
})

function applyDarkMode(val) {
  document.documentElement.classList.toggle('dark', val)
}

onMounted(async () => {
  applyDarkMode(store.darkMode)

  // QR-Import via URL-Parameter ?import=BASE64
  const params = new URLSearchParams(location.search)
  const raw = params.get('import')
  if (raw) {
    try {
      const list = JSON.parse(decodeURIComponent(escape(atob(raw))))
      if (!Array.isArray(list)) throw new Error()

      // Alle bestehenden Daten löschen
      store.clearAll()
      localStorage.removeItem('abfahrten-v1')

      // Service-Worker-Caches leeren
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }

      // Neu aufbauen
      for (const s of list) {
        const efaId = s.i ?? s.stopId
        const name  = s.n ?? s.stopName
        store.addStop(efaId, name, s.la ?? null, s.lo ?? null)
        const added = store.stops.find(x => x.stopId === efaId)
        if (added) {
          for (const f of (s.f ?? s.filters ?? [])) {
            const line = Array.isArray(f) ? f[0] : f.line
            const dir  = Array.isArray(f) ? f[1] : f.direction
            store.addFilter(added.id, line, dir)
          }
        }
      }
    } catch { /* ungültiger Import – still ignorieren */ }
    // Parameter aus URL entfernen und App neu laden damit alles frisch startet
    history.replaceState({}, '', location.pathname)
    location.replace('/')
  }
})
watch(() => store.darkMode, applyDarkMode)
</script>

<template>
  <div id="app-shell">
    <UpdatePrompt />
    <main ref="mainEl" class="bg-ios-gray dark:bg-ios-dark-bg" style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 52px);">
      <router-view v-slot="{ Component }">
        <keep-alive include="HomeView">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
    <BottomNav />
  </div>
</template>
