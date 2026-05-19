import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const APIKEY_KEY = 'assistant-apikey-v1'
const MODEL_KEY = 'assistant-model-v1'
const HISTORY_KEY = 'assistant-history-v1'
const MAX_MESSAGES = 10

export const useAssistantStore = defineStore('assistant', () => {
  const openrouterApiKey = ref(localStorage.getItem(APIKEY_KEY) || '')
  const openrouterModel = ref(localStorage.getItem(MODEL_KEY) || '')
  const chatHistory = ref((() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [] } catch { return [] }
  })())

  watch(openrouterApiKey, val => localStorage.setItem(APIKEY_KEY, val))
  watch(openrouterModel, val => localStorage.setItem(MODEL_KEY, val))
  watch(chatHistory, val => localStorage.setItem(HISTORY_KEY, JSON.stringify(val)), { deep: true })

  function setApiKey(key) { openrouterApiKey.value = key }
  function setModel(model) { openrouterModel.value = model }
  function addMessage(msg) {
    chatHistory.value = [...chatHistory.value, msg].slice(-MAX_MESSAGES)
  }
  function clearHistory() { chatHistory.value = [] }

  return { openrouterApiKey, openrouterModel, chatHistory, setApiKey, setModel, addMessage, clearHistory }
})
