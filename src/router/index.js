import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SettingsView from '../views/SettingsView.vue'
import TripPlannerView from '../views/TripPlannerView.vue'
import TripDetailView from '../views/TripDetailView.vue'

export default createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0, behavior: 'instant' }),
  routes: [
    { path: '/', component: HomeView, meta: { title: 'Abfahrten' } },
    { path: '/trip', component: TripPlannerView, meta: { title: 'Reiseplaner' } },
    { path: '/trip/detail', component: TripDetailView, meta: { title: 'Reisedetails' } },
    { path: '/settings', component: SettingsView, meta: { title: 'Einstellungen' } }
  ]
})
