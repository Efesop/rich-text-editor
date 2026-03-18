import { create } from 'zustand'

export const AI_PRESETS = {
  ollama: {
    name: 'Ollama',
    defaultEndpoint: 'http://localhost:11434',
    apiPath: '/api/chat',
    modelsPath: '/api/tags',
    docUrl: 'https://ollama.com',
    steps: [
      'Download & install Ollama from ollama.com',
      'Open a terminal and run: ollama pull llama3.2',
      'Ollama runs automatically after install — no server start needed',
      'Enable CORS: run OLLAMA_ORIGINS="http://localhost:3000" ollama serve',
      'Click Test Connection below'
    ]
  },
  lmstudio: {
    name: 'LM Studio',
    defaultEndpoint: 'http://localhost:1234',
    apiPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    docUrl: 'https://lmstudio.ai',
    steps: [
      'Download & install LM Studio from lmstudio.ai',
      'Download a model from the Discover tab',
      'Go to the Developer tab → Local Server',
      'Click Server Settings and enable "Enable CORS"',
      'Load a model and toggle Status to Running',
      'Click Test Connection below'
    ]
  },
  localai: {
    name: 'LocalAI',
    defaultEndpoint: 'http://localhost:8080',
    apiPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    docUrl: 'https://localai.io',
    steps: [
      'Install via Homebrew: brew install localai',
      'Run: local-ai run llama-3.2-1b-instruct:q4_k_m (downloads model & starts server on port 8080)',
      'CORS is enabled by default — no extra config needed',
      'Click Test Connection below'
    ]
  },
  jan: {
    name: 'Jan',
    defaultEndpoint: 'http://localhost:1337',
    apiPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    docUrl: 'https://jan.ai',
    steps: [
      'Download & install Jan from jan.ai',
      'Open Jan and download a model from the Hub tab',
      'Go to Settings → Local API Server → click Start Server',
      'Click the Configuration button (top right) and enable CORS',
      'Click Test Connection below'
    ]
  },
  custom: {
    name: 'Custom',
    defaultEndpoint: 'http://localhost:8000',
    apiPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    docUrl: '',
    steps: [
      'Enter the endpoint URL for your OpenAI-compatible server',
      'Make sure CORS is enabled for localhost',
      'The server should expose /v1/chat/completions and /v1/models',
      'Click Test Connection below'
    ]
  }
}

const STORAGE_KEY = 'dash-ai-settings'

function loadFromStorage() {
  try {
    const raw = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      presetKey: state.presetKey,
      endpoint: state.endpoint,
      model: state.model,
      temperature: state.temperature,
      maxTokens: state.maxTokens
    }))
  } catch { /* ignore */ }
}

const saved = loadFromStorage()
// Migrate old default: 1024 was too low for thinking models
if (saved?.maxTokens === 1024) saved.maxTokens = 4096

const useAIStore = create((set, get) => ({
  presetKey: saved?.presetKey || 'ollama',
  endpoint: saved?.endpoint || AI_PRESETS.ollama.defaultEndpoint,
  model: saved?.model || '',
  temperature: saved?.temperature ?? 0.7,
  maxTokens: saved?.maxTokens ?? 4096,

  setPreset: (key) => {
    const preset = AI_PRESETS[key]
    if (!preset) return
    set({ presetKey: key, endpoint: preset.defaultEndpoint, model: '' })
    saveToStorage(get())
  },

  setEndpoint: (endpoint) => {
    set({ endpoint })
    saveToStorage(get())
  },

  setModel: (model) => {
    set({ model })
    saveToStorage(get())
  },

  setTemperature: (temperature) => {
    set({ temperature })
    saveToStorage(get())
  },

  setMaxTokens: (maxTokens) => {
    set({ maxTokens })
    saveToStorage(get())
  },

  get preset() {
    return AI_PRESETS[get().presetKey] || AI_PRESETS.ollama
  }
}))

export default useAIStore
