import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, RefreshCw, Copy, Check, ChevronDown, ChevronUp, Square, ArrowDownToLine, Replace, Send, Undo2,
  Sparkles, PenLine, ArrowRight, SpellCheck, Maximize2, List,
  Lightbulb, ListTree, CheckSquare, Users, Scale, BookOpen, Notebook, CalendarDays, FilePlus } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'
import AIOrb from './AIOrb'
import useAIStore, { AI_PRESETS } from '@/store/aiStore'
import { checkConnection, streamChat, buildPrompt } from '@/lib/localAI'
import { exportToMarkdown } from '@/utils/exportUtils'

const CONTENT_SUGGESTIONS = [
  {
    items: [
      { label: 'Summarize', desc: 'Condense into key points', prompt: 'Summarize this concisely, focusing on the key points and main ideas.', icon: Sparkles, anim: 'summarize' },
      { label: 'Rewrite', desc: 'Improve clarity and flow', prompt: 'Rewrite this to improve clarity and readability while preserving the meaning.', icon: PenLine, anim: 'rewrite' },
      { label: 'Continue', desc: 'Keep writing from where it ends', prompt: 'Continue writing from where this leaves off, matching the style and tone.', icon: ArrowRight, anim: 'continue' },
      { label: 'Fix grammar', desc: 'Correct spelling and grammar', prompt: 'Fix any grammar, spelling, or punctuation errors. Keep the original meaning and style.', icon: SpellCheck, anim: 'grammar' },
      { label: 'Expand', desc: 'Add more detail and depth', prompt: 'Expand on this with more detail, examples, or explanation.', icon: Maximize2, anim: 'expand' },
      { label: 'Bullet points', desc: 'Convert into a structured list', prompt: 'Convert this into a well-organized bullet point list.', icon: List, anim: 'bullets' }
    ]
  }
]

const EMPTY_SUGGESTIONS = [
  {
    heading: 'Create',
    items: [
      { label: 'Brainstorm', desc: 'Generate ideas on a topic', prompt: 'Brainstorm ideas about ', icon: Lightbulb, anim: 'brainstorm' },
      { label: 'Outline', desc: 'Structure thoughts into sections', prompt: 'Create a detailed outline for ', icon: ListTree, anim: 'outline' },
      { label: 'To-do list', desc: 'Plan tasks and action items', prompt: 'Create a to-do list for ', icon: CheckSquare, anim: 'todo' },
      { label: 'Meeting notes', desc: 'Set up a meeting template', prompt: 'Create a meeting notes template for ', icon: Users, anim: 'meeting' }
    ]
  },
  {
    heading: 'Write',
    items: [
      { label: 'Pros and cons', desc: 'Weigh up a decision', prompt: 'Create a pros and cons list for ', icon: Scale, anim: 'proscons' },
      { label: 'Research notes', desc: 'Organize findings on a topic', prompt: 'Help me organize research notes about ', icon: BookOpen, anim: 'research' },
      { label: 'Journal entry', desc: 'Reflective writing prompt', prompt: 'Write a reflective journal entry about ', icon: Notebook, anim: 'journal' },
      { label: 'Weekly plan', desc: 'Plan out the week ahead', prompt: 'Create a weekly plan for ', icon: CalendarDays, anim: 'weekly' }
    ]
  }
]

// Mini animated illustrations for AI suggestion cards
function AISuggestionIllus ({ anim, theme }) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'
  const accent = isFallout ? '#4ade80' : isDarkBlue ? '#60a5fa' : isDark ? '#60a5fa' : '#3b82f6'
  const muted = isFallout ? '#166534' : isDarkBlue ? '#1c2438' : isDark ? '#3a3a3a' : '#e5e7eb'
  const textMuted = isFallout ? '#22c55e' : isDarkBlue ? '#5d6b88' : isDark ? '#6b6b6b' : '#9ca3af'

  switch (anim) {
    case 'summarize':
      // 4 lines compressing into 2
      return (
        <div className="dash-ai-illus dash-ai-illus-summarize">
          <div className="dash-ai-sum-line dash-ai-sum-l1" style={{ background: textMuted }} />
          <div className="dash-ai-sum-line dash-ai-sum-l2" style={{ background: textMuted }} />
          <div className="dash-ai-sum-line dash-ai-sum-l3" style={{ background: textMuted }} />
          <div className="dash-ai-sum-line dash-ai-sum-l4" style={{ background: textMuted }} />
          <div className="dash-ai-sum-result dash-ai-sum-r1" style={{ background: accent }} />
          <div className="dash-ai-sum-result dash-ai-sum-r2" style={{ background: accent }} />
        </div>
      )
    case 'rewrite':
      // Line being erased and rewritten
      return (
        <div className="dash-ai-illus dash-ai-illus-rewrite">
          <div className="dash-ai-rw-old" style={{ background: textMuted }} />
          <div className="dash-ai-rw-new" style={{ background: accent }} />
          <div className="dash-ai-rw-cursor" style={{ background: accent }} />
        </div>
      )
    case 'continue':
      // Existing lines then new ones fading in below
      return (
        <div className="dash-ai-illus dash-ai-illus-continue">
          <div className="dash-ai-cont-existing" style={{ background: textMuted }} />
          <div className="dash-ai-cont-existing" style={{ background: textMuted, width: '60%' }} />
          <div className="dash-ai-cont-new dash-ai-cont-n1" style={{ background: accent }} />
          <div className="dash-ai-cont-new dash-ai-cont-n2" style={{ background: accent, width: '50%' }} />
        </div>
      )
    case 'grammar':
      // Squiggly line under text that gets fixed
      return (
        <div className="dash-ai-illus dash-ai-illus-grammar">
          <div className="dash-ai-gram-line" style={{ background: textMuted }} />
          <div className="dash-ai-gram-squig" style={{ borderColor: '#ef4444' }} />
          <div className="dash-ai-gram-fix" style={{ background: accent }} />
        </div>
      )
    case 'expand':
      // 2 lines growing into 4
      return (
        <div className="dash-ai-illus dash-ai-illus-expand">
          <div className="dash-ai-exp-line" style={{ background: textMuted }} />
          <div className="dash-ai-exp-line" style={{ background: textMuted, width: '55%' }} />
          <div className="dash-ai-exp-new dash-ai-exp-n1" style={{ background: accent }} />
          <div className="dash-ai-exp-new dash-ai-exp-n2" style={{ background: accent, width: '45%' }} />
        </div>
      )
    case 'bullets':
      // Paragraph lines rearranging into bullet list
      return (
        <div className="dash-ai-illus dash-ai-illus-bullets">
          {[1, 2, 3].map(i => (
            <div key={i} className={`dash-ai-bul-row dash-ai-bul-r${i}`}>
              <div className="dash-ai-bul-dot" style={{ background: accent }} />
              <div className="dash-ai-bul-text" style={{ background: textMuted }} />
            </div>
          ))}
        </div>
      )
    case 'brainstorm':
      // Central dot with ideas radiating out
      return (
        <div className="dash-ai-illus dash-ai-illus-brainstorm">
          <div className="dash-ai-brain-center" style={{ background: accent }} />
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={`dash-ai-brain-dot dash-ai-brain-d${i}`} style={{ background: `${accent}90` }} />
          ))}
        </div>
      )
    case 'outline':
      // Indented tree appearing line by line
      return (
        <div className="dash-ai-illus dash-ai-illus-outline">
          <div className="dash-ai-out-line dash-ai-out-l1" style={{ background: accent }} />
          <div className="dash-ai-out-line dash-ai-out-l2" style={{ background: textMuted, marginLeft: 6 }} />
          <div className="dash-ai-out-line dash-ai-out-l3" style={{ background: textMuted, marginLeft: 6 }} />
          <div className="dash-ai-out-line dash-ai-out-l4" style={{ background: accent }} />
        </div>
      )
    case 'todo':
      // Checkboxes appearing and one getting checked
      return (
        <div className="dash-ai-illus dash-ai-illus-todo">
          {[1, 2, 3].map(i => (
            <div key={i} className={`dash-ai-todo-row dash-ai-todo-r${i}`}>
              <div className={`dash-ai-todo-box ${i === 1 ? 'dash-ai-todo-checked' : ''}`} style={{ borderColor: i === 1 ? accent : textMuted, background: i === 1 ? `${accent}30` : 'transparent' }} />
              <div className="dash-ai-todo-text" style={{ background: textMuted }} />
            </div>
          ))}
        </div>
      )
    case 'meeting':
      // Two person icons with note lines
      return (
        <div className="dash-ai-illus dash-ai-illus-meeting">
          <div className="dash-ai-meet-people">
            <div className="dash-ai-meet-person" style={{ background: accent }} />
            <div className="dash-ai-meet-person" style={{ background: `${accent}80` }} />
          </div>
          <div className="dash-ai-meet-notes">
            <div className="dash-ai-meet-line dash-ai-meet-ml1" style={{ background: textMuted }} />
            <div className="dash-ai-meet-line dash-ai-meet-ml2" style={{ background: textMuted }} />
          </div>
        </div>
      )
    case 'proscons':
      // Two columns with + and - indicators
      return (
        <div className="dash-ai-illus dash-ai-illus-proscons">
          <div className="dash-ai-pc-col dash-ai-pc-pro">
            <div className="dash-ai-pc-icon" style={{ color: '#22c55e' }}>+</div>
            <div className="dash-ai-pc-line" style={{ background: textMuted }} />
            <div className="dash-ai-pc-line" style={{ background: textMuted, width: '70%' }} />
          </div>
          <div className="dash-ai-pc-divider" style={{ background: muted }} />
          <div className="dash-ai-pc-col dash-ai-pc-con">
            <div className="dash-ai-pc-icon" style={{ color: '#ef4444' }}>−</div>
            <div className="dash-ai-pc-line" style={{ background: textMuted }} />
            <div className="dash-ai-pc-line" style={{ background: textMuted, width: '60%' }} />
          </div>
        </div>
      )
    case 'research':
      // Open book with highlight lines
      return (
        <div className="dash-ai-illus dash-ai-illus-research">
          <div className="dash-ai-res-page" style={{ borderColor: muted }}>
            <div className="dash-ai-res-line" style={{ background: textMuted }} />
            <div className="dash-ai-res-line dash-ai-res-hl" style={{ background: `${accent}50` }} />
            <div className="dash-ai-res-line" style={{ background: textMuted }} />
          </div>
        </div>
      )
    case 'journal':
      // Pen writing a line
      return (
        <div className="dash-ai-illus dash-ai-illus-journal">
          <div className="dash-ai-jour-line" style={{ background: muted }} />
          <div className="dash-ai-jour-text" style={{ background: accent }} />
          <div className="dash-ai-jour-line" style={{ background: muted }} />
          <div className="dash-ai-jour-line" style={{ background: muted }} />
        </div>
      )
    case 'weekly':
      // Calendar grid cells filling in
      return (
        <div className="dash-ai-illus dash-ai-illus-weekly">
          <div className="dash-ai-week-grid">
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className={`dash-ai-week-cell dash-ai-week-c${i}`} style={{ background: i < 3 ? `${accent}40` : muted, borderColor: i < 3 ? accent : 'transparent' }} />
            ))}
          </div>
        </div>
      )
    default:
      return null
  }
}

export default function AIPanel ({ isOpen, onClose, theme, currentPage, contextText, blockIndex, blockId, blockIndices, onInsertBlocks, canUndo, onUndo, onSaveAsNote }) {
  const [animateIn, setAnimateIn] = useState(false)
  const [showSettings, setShowSettings] = useState(true)
  const [models, setModels] = useState([])
  const [connectionStatus, setConnectionStatus] = useState(null) // null | 'checking' | 'connected' | 'error'
  const [connectionError, setConnectionError] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef(null)
  const [waitSeconds, setWaitSeconds] = useState(0)
  const waitTimerRef = useRef(null)
  const responseRef = useRef(null)
  const chatScrollRef = useRef(null)
  const fullTextRef = useRef('')
  const [chatHistory, setChatHistory] = useState([])     // full messages array for API
  const [chatDisplay, setChatDisplay] = useState([])      // [{role, content}] for UI thread
  const sentMessagesRef = useRef([])                       // messages sent to API for current turn

  const { presetKey, endpoint, model, temperature, maxTokens, setPreset, setEndpoint, setModel } = useAIStore()
  const preset = AI_PRESETS[presetKey] || AI_PRESETS.ollama

  const handleClose = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setAnimateIn(true))
      if (model && endpoint) {
        setShowSettings(false)
      }
      // Reset state on reopen
      setIsDone(false)
      setStreamingText('')
      setCustomPrompt('')
      setWaitSeconds(0)
      if (waitTimerRef.current) { clearInterval(waitTimerRef.current); waitTimerRef.current = null }
      fullTextRef.current = ''
      setChatHistory([])
      setChatDisplay([])
      sentMessagesRef.current = []
      setSelectedResponseIdx(-1)
      setExpandedMsgIdx(null)
    } else {
      setAnimateIn(false)
      if (waitTimerRef.current) { clearInterval(waitTimerRef.current); waitTimerRef.current = null }
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, handleClose])

  const handleTestConnection = useCallback(async () => {
    setConnectionStatus('checking')
    setConnectionError('')
    const result = await checkConnection(endpoint, presetKey)
    if (result.connected) {
      setConnectionStatus('connected')
      setModels(result.models)
      if (result.models.length > 0) {
        // Auto-select first model if none saved, or if saved model isn't available
        if (!model || !result.models.includes(model)) {
          setModel(result.models[0])
        }
      }
    } else {
      setConnectionStatus('error')
      setConnectionError(result.error)
      setModels([])
    }
  }, [endpoint, presetKey, model, setModel])

  // Auto-test when endpoint or preset changes (debounced for typing)
  const prevPresetRef = useRef(presetKey)
  useEffect(() => {
    if (!isOpen || !endpoint) return
    const presetChanged = prevPresetRef.current !== presetKey
    prevPresetRef.current = presetKey
    const delay = presetChanged ? 0 : 600
    const timer = setTimeout(() => {
      handleTestConnection()
    }, delay)
    return () => clearTimeout(timer)
  }, [isOpen, endpoint, presetKey, handleTestConnection])

  const getContextMarkdown = useCallback(() => {
    if (contextText) return contextText
    if (!currentPage?.content) return ''
    return exportToMarkdown(currentPage.content)
  }, [contextText, currentPage])

  const handleSend = useCallback(async () => {
    if (!customPrompt.trim() || isStreaming) return
    const promptText = customPrompt.trim()

    setIsStreaming(true)
    setIsDone(false)
    setStreamingText('')
    fullTextRef.current = ''
    setWaitSeconds(0)
    if (waitTimerRef.current) clearInterval(waitTimerRef.current)
    waitTimerRef.current = setInterval(() => setWaitSeconds(s => s + 1), 1000)

    const controller = new AbortController()
    abortRef.current = controller

    let messages
    if (chatHistory.length > 0) {
      // Follow-up — append to existing conversation
      messages = [...chatHistory, { role: 'user', content: promptText }]
    } else {
      // First message — include note context
      const markdown = getContextMarkdown() || ''
      messages = buildPrompt('custom', markdown, promptText)
    }
    sentMessagesRef.current = messages

    // Add user message to display immediately
    setChatDisplay(prev => [...prev, { role: 'user', content: promptText }])
    setCustomPrompt('')

    await streamChat({
      endpoint,
      model,
      presetKey,
      messages,
      temperature,
      maxTokens,
      signal: controller.signal,
      onChunk: (chunk) => {
        // Stop the wait timer once first token arrives
        if (waitTimerRef.current) { clearInterval(waitTimerRef.current); waitTimerRef.current = null }
        fullTextRef.current += chunk
        setStreamingText(fullTextRef.current)
        if (responseRef.current) {
          responseRef.current.scrollTop = responseRef.current.scrollHeight
        }
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
        }
      },
      onDone: () => {
        if (waitTimerRef.current) { clearInterval(waitTimerRef.current); waitTimerRef.current = null }
        setIsStreaming(false)
        if (!fullTextRef.current) {
          setStreamingText('*No response received — the model may have used all tokens on internal reasoning. Try increasing max tokens or using a different model.*')
        }
        // Update chat history for follow-ups
        const updated = [...sentMessagesRef.current, { role: 'assistant', content: fullTextRef.current }]
        setChatHistory(updated)
        setChatDisplay(prev => [...prev, { role: 'assistant', content: fullTextRef.current }])
        setIsDone(true)
      },
      onError: (err) => {
        if (waitTimerRef.current) { clearInterval(waitTimerRef.current); waitTimerRef.current = null }
        setIsStreaming(false)
        setIsDone(true)
        const errMsg = fullTextRef.current
          ? fullTextRef.current + '\n\n---\n*Error: ' + err.message + '*'
          : '*Error: ' + err.message + '*'
        setStreamingText(errMsg)
        setChatDisplay(prev => [...prev, { role: 'assistant', content: errMsg }])
      }
    })
  }, [isStreaming, getContextMarkdown, endpoint, model, presetKey, temperature, maxTokens, customPrompt, chatHistory])

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const [selectedResponseIdx, setSelectedResponseIdx] = useState(-1) // -1 = latest (streaming/current)
  const [expandedMsgIdx, setExpandedMsgIdx] = useState(null) // index of expanded previous assistant message

  const insertingRef = useRef(false)

  // Get the text for the currently selected response (for insert/copy/save)
  const getSelectedText = useCallback(() => {
    if (selectedResponseIdx === -1) return fullTextRef.current
    // Find the nth assistant message in chatDisplay
    let count = 0
    for (const msg of chatDisplay) {
      if (msg.role === 'assistant') {
        if (count === selectedResponseIdx) return msg.content
        count++
      }
    }
    return fullTextRef.current
  }, [selectedResponseIdx, chatDisplay])

  const handleInsert = useCallback(async (mode) => {
    const text = getSelectedText()
    if (!text || !onInsertBlocks || insertingRef.current) return
    insertingRef.current = true
    try {
      const { parseMarkdownToBlocks } = await import('./Editor')
      const { sanitizeEditorContent } = await import('@/utils/securityUtils')
      const rawBlocks = parseMarkdownToBlocks(text)
      const sanitized = sanitizeEditorContent({ blocks: rawBlocks })
      const blocks = sanitized?.blocks || []
      if (blocks.length > 0) {
        onInsertBlocks(blocks, mode, contextText, blockIndex, blockIndices, blockId)
        handleClose()
      }
    } finally {
      insertingRef.current = false
    }
  }, [onInsertBlocks, handleClose, contextText, blockIndex, blockId, blockIndices, getSelectedText])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getSelectedText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }, [getSelectedText])

  // Markdown rendering
  const renderMarkdown = useCallback((text) => {
    if (!text) return ''
    return DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }))
  }, [])

  const renderedResponse = useMemo(() => renderMarkdown(streamingText), [streamingText, renderMarkdown])

  // Group chat into user+assistant pairs for joined display
  // Each pair: { user: string, assistant: string|null, assistantIdx: number }
  // The last pair may have no assistant if it's currently streaming
  const chatPairs = useMemo(() => {
    const pairs = []
    let assistantCount = 0
    for (let i = 0; i < chatDisplay.length; i++) {
      const msg = chatDisplay[i]
      if (msg.role === 'user') {
        const next = chatDisplay[i + 1]
        if (next && next.role === 'assistant') {
          // Check if this is the last assistant message (shown separately as streamingText)
          const isLastAssistant = i + 1 === chatDisplay.length - 1
          if (isLastAssistant) {
            // This pair's assistant is shown via streamingText — don't include it here
            pairs.push({ user: msg.content, assistant: null, assistantIdx: assistantCount })
          } else {
            pairs.push({ user: msg.content, assistant: next.content, assistantIdx: assistantCount })
          }
          assistantCount++
          i++ // skip the assistant message
        } else {
          // User message with no response yet (currently streaming)
          pairs.push({ user: msg.content, assistant: null, assistantIdx: null })
        }
      }
    }
    return pairs
  }, [chatDisplay])

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const panelBg = isFallout
    ? 'bg-gray-900 border-l-2 border-green-500/60'
    : isDarkBlue
      ? 'bg-[#141825] border-l border-[#1c2438]'
      : isDark
        ? 'bg-[#1a1a1a] border-l border-[#3a3a3a]/50'
        : 'bg-white border-l border-gray-200'

  const titleColor = isFallout
    ? 'text-green-400 font-mono'
    : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900'

  const descColor = isFallout
    ? 'text-green-600 font-mono'
    : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'

  const inputBg = isFallout
    ? 'bg-gray-800 border-green-500/30 text-green-300 font-mono placeholder:text-green-700 focus:border-green-400'
    : isDarkBlue
      ? 'bg-[#0c1017] border-[#1c2438] text-[#e0e6f0] placeholder:text-[#3d4b66] focus:border-blue-500/50'
      : isDark
        ? 'bg-[#232323] border-[#3a3a3a] text-[#ececec] placeholder:text-[#555] focus:border-blue-500/50'
        : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-blue-400'

  const cardBg = isFallout
    ? 'bg-gray-800/50 border-green-500/15 hover:border-green-500/30'
    : isDarkBlue
      ? 'bg-[#0c1017]/50 border-[#1c2438] hover:border-[#232b42]'
      : isDark
        ? 'bg-[#232323] border-[#3a3a3a]/50 hover:border-[#4a4a4a]'
        : 'bg-gray-50/80 border-gray-200/60 hover:border-gray-300'

  const cardActiveBg = isFallout
    ? 'bg-green-500/15 border-green-500/50 text-green-300'
    : isDarkBlue
      ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
      : isDark
        ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
        : 'bg-blue-50 border-blue-400 text-blue-700'

  const btnPrimary = isFallout
    ? 'bg-green-500/20 text-green-300 border border-green-500/40 hover:bg-green-500/30'
    : isDarkBlue
      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30'
      : isDark
        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30'
        : 'bg-blue-500 text-white hover:bg-blue-600'

  const btnSecondary = isFallout
    ? 'bg-gray-800 text-green-400 border border-green-500/20 hover:border-green-500/40'
    : isDarkBlue
      ? 'bg-[#0c1017] text-[#8b99b5] border border-[#1c2438] hover:border-[#232b42]'
      : isDark
        ? 'bg-[#2a2a2a] text-[#aaa] border border-[#3a3a3a] hover:border-[#4a4a4a]'
        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:border-gray-300'

  const responseBg = isFallout
    ? 'bg-black/30 border-green-500/20 text-green-300 font-mono'
    : isDarkBlue
      ? 'bg-[#0a0e16] border-[#1c2438] text-[#c8d0e0]'
      : isDark
        ? 'bg-[#151515] border-[#2a2a2a] text-[#d4d4d4]'
        : 'bg-gray-50 border-gray-200 text-gray-800'

  const userMsgBg = isFallout
    ? 'bg-green-500/8 border-green-500/15 text-green-300 font-mono'
    : isDarkBlue
      ? 'bg-blue-500/8 border-[#1c2438] text-[#c8d0e0]'
      : isDark
        ? 'bg-blue-500/8 border-[#2a2a2a] text-[#d4d4d4]'
        : 'bg-blue-50/50 border-blue-100 text-gray-800'

  const isEncrypted = currentPage?.encryptedContent && !currentPage?.content
  const hasNote = !!currentPage
  const isConnected = connectionStatus === 'connected'
  const canSend = isConnected && model && hasNote && !isEncrypted && !isStreaming && !!customPrompt.trim()
  const hasSelection = !!contextText
  const noteHasContent = !!(currentPage?.content?.blocks?.some(b => {
    const t = b.data?.text || b.data?.code || b.data?.caption || ''
    return t.replace(/<[^>]*>/g, '').trim().length > 0 ||
      (Array.isArray(b.data?.items) && b.data.items.length > 0) ||
      (Array.isArray(b.data?.content) && b.data.content.length > 0)
  }))

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      <div
        className={`
          fixed top-0 right-0 bottom-0 z-50 w-[440px] max-w-[90vw]
          flex flex-col shadow-2xl
          transition-transform duration-300 ease-out
          ${animateIn ? 'translate-x-0' : 'translate-x-full'}
          ${panelBg}
        `}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0
          ${isFallout ? 'border-b border-green-500/30' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#3a3a3a]' : 'border-b border-gray-100'}
        `}>
          <div className="flex items-center gap-3">
            <div className="transition-all duration-500 ease-out" style={{ transform: isStreaming ? 'scale(0.55)' : 'scale(1)', marginRight: isStreaming ? -10 : 0 }}>
              <AIOrb state={isStreaming ? 'generating' : 'idle'} size={44} theme={theme} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${titleColor}`}>Local AI</h2>
              <p className={`text-xs ${descColor}`}>Runs on your machine, stays private</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(isDone || chatHistory.length > 0) && (
              <button
                onClick={() => { setIsDone(false); setStreamingText(''); fullTextRef.current = ''; setCustomPrompt(''); setChatHistory([]); setChatDisplay([]); sentMessagesRef.current = []; setSelectedResponseIdx(-1); setExpandedMsgIdx(null) }}
                className={`p-2 rounded-lg transition-colors ${isFallout ? 'hover:bg-green-500/10 text-green-500' : isDarkBlue ? 'hover:bg-[#1c2438] text-[#5d6b88]' : isDark ? 'hover:bg-[#2a2a2a] text-[#6b6b6b]' : 'hover:bg-gray-100 text-gray-400'}`}
                title="New chat"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button onClick={handleClose} className={`p-2 rounded-lg transition-colors ${isFallout ? 'hover:bg-green-500/10 text-green-500' : isDarkBlue ? 'hover:bg-[#1c2438] text-[#5d6b88]' : isDark ? 'hover:bg-[#2a2a2a] text-[#6b6b6b]' : 'hover:bg-gray-100 text-gray-400'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 flex flex-col">
          {/* Settings */}
          <div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center justify-between w-full text-left text-sm font-medium ${titleColor}`}
            >
              <span className="flex items-center gap-2">
                {isConnected && !showSettings ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    {preset.name} · {model}
                  </>
                ) : (
                  'Settings'
                )}
              </span>
              {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showSettings && (
              <div className="mt-3 space-y-3">
                {/* Preset selector */}
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(AI_PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => setPreset(key)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        presetKey === key ? cardActiveBg : `${cardBg} ${descColor}`
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                {/* Model selector */}
                {models.length > 0 && (
                  <div>
                    <label className={`text-xs font-medium ${descColor}`}>Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm outline-none ${inputBg}`}
                    >
                      {!model && <option value="">Select a model...</option>}
                      {models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Endpoint */}
                <div>
                  <label className={`text-xs font-medium ${descColor}`}>Endpoint URL</label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${inputBg}`}
                    placeholder="http://localhost:11434"
                  />
                </div>

                {/* Connection status */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={connectionStatus === 'checking'}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnSecondary}`}
                  >
                    <RefreshCw className={`w-3 h-3 ${connectionStatus === 'checking' ? 'animate-spin' : ''}`} />
                    Test Connection
                  </button>
                  {connectionStatus === 'connected' && (
                    <span className="flex items-center gap-1.5 text-xs text-green-500">
                      <span className="w-2 h-2 rounded-full bg-green-500" /> Connected
                    </span>
                  )}
                  {connectionStatus === 'error' && (
                    <span className={`text-xs ${isFallout ? 'text-red-400' : 'text-red-500'}`}>
                      {connectionError}
                    </span>
                  )}
                </div>

                {/* Setup instructions */}
                {connectionStatus !== 'connected' && preset.steps && (
                  <div className={`rounded-lg border p-3 space-y-2 ${cardBg}`}>
                    <p className={`text-xs font-medium ${titleColor}`}>Setup {preset.name}</p>
                    <ol className={`text-xs space-y-1.5 ${descColor}`}>
                      {preset.steps.map((step, i) => (
                        <li key={i} className="flex gap-2">
                          <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isFallout ? 'bg-green-500/20 text-green-400'
                              : isDarkBlue ? 'bg-blue-500/15 text-blue-400'
                                : isDark ? 'bg-blue-500/15 text-blue-400'
                                  : 'bg-blue-100 text-blue-600'
                          }`}>{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                    {preset.docUrl && (
                      <a
                        href={preset.docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-block mt-1 text-xs font-medium underline ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-blue-400' : 'text-blue-600'}`}
                      >
                        Download {preset.name}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className={`border-t ${isFallout ? 'border-green-500/20' : isDarkBlue ? 'border-[#1c2438]' : isDark ? 'border-[#2a2a2a]' : 'border-gray-100'}`} />

          {/* Actions */}
          {!hasNote ? (
            <p className={`text-sm ${descColor}`}>Select a note to use AI</p>
          ) : isEncrypted ? (
            <p className={`text-sm ${descColor}`}>Unlock this note to use AI</p>
          ) : !isConnected ? (
            <p className={`text-sm ${descColor}`}>Follow the setup steps above to connect</p>
          ) : (
            <>
              {/* First message: input + suggestions inline */}
              {chatHistory.length === 0 && !isStreaming && (!isDone || !streamingText) && (
                <div className="space-y-2.5">
                  {/* Selected text context — compact, blue tint */}
                  {(() => {
                    if (!hasSelection) return null
                    const contextMd = getContextMarkdown()
                    if (!contextMd || !contextMd.trim()) return null
                    const lines = contextMd.split('\n').filter(l => l.trim())
                    const preview = contextMd.length > 120 ? contextMd.slice(0, 120) + '…' : contextMd
                    return (
                      <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed ${
                        isFallout ? 'bg-green-500/10 border-green-500/20 text-green-300/70 font-mono' : isDarkBlue ? 'bg-blue-500/10 border-blue-500/20 text-blue-200/70' : isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-200/70' : 'bg-blue-50 border-blue-200 text-blue-700/70'
                      }`}>
                        <span className={`font-semibold ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-300' : isDark ? 'text-blue-300' : 'text-blue-600'}`}>Selected text</span>
                        <span className={`ml-1.5 opacity-60 ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-300' : isDark ? 'text-blue-300' : 'text-blue-500'}`}>· {lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
                        <p className="mt-0.5 whitespace-pre-wrap break-words line-clamp-2">{preview}</p>
                      </div>
                    )
                  })()}

                  <div className="relative">
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) {
                          e.preventDefault()
                          handleSend()
                        } else if (e.key === 'Enter' && !e.shiftKey && canSend) {
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                      placeholder={hasSelection ? 'What do you want to do with this text?' : 'What would you like to write about?'}
                      rows={3}
                      disabled={isStreaming}
                      className={`w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none disabled:opacity-50 ${inputBg}`}
                    />
                    <span className={`absolute bottom-1.5 right-2.5 text-[10px] ${descColor} pointer-events-none`}>
                      ⏎ send · ⇧⏎ new line
                    </span>
                  </div>

                  <button
                    onClick={() => handleSend()}
                    disabled={!canSend}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${btnPrimary}`}
                  >
                    <Send className="w-3.5 h-3.5" /> Submit
                  </button>

                  {/* Suggestions */}
                  <div className="space-y-3 pt-1">
                    {((hasSelection || noteHasContent) ? CONTENT_SUGGESTIONS : EMPTY_SUGGESTIONS).map((section, si) => (
                      <div key={section.heading || si}>
                        {section.heading && (
                          <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${descColor}`}>
                            {section.heading}
                          </p>
                        )}
                        <div className="space-y-1">
                          {section.items.map((action, ai) => {
                            const isActive = customPrompt === action.prompt
                            return (
                              <button
                                key={action.label}
                                onClick={() => setCustomPrompt(action.prompt)}
                                className={`dash-feat-card-enter w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-2.5 ${
                                  isActive ? cardActiveBg : `${cardBg} ${descColor}`
                                }`}
                                style={{ animationDelay: `${ai * 50}ms` }}
                              >
                                <span className="flex-1">
                                  <span className={`text-xs font-semibold ${isActive
                                    ? ''
                                    : isFallout ? 'text-green-300' : isDarkBlue ? 'text-[#c0ccdf]' : isDark ? 'text-[#ddd]' : 'text-gray-800'
                                  }`}>
                                    {action.label}
                                  </span>
                                  <span className={`text-[11px] ml-2 ${isActive ? 'opacity-80' : ''}`}>
                                    {action.desc}
                                  </span>
                                </span>
                                <div className="flex-shrink-0 w-8 h-6 flex items-center justify-center">
                                  <AISuggestionIllus anim={action.anim} theme={theme} />
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat messages — pushed to bottom (only shown when chat has started) */}
              {(chatHistory.length > 0 || isStreaming || (isDone && streamingText)) && (
              <div className="mt-auto space-y-3">

              {/* Previous exchange pairs (user Q + AI A joined) */}
              {chatPairs.filter(p => p.assistant != null).map((pair, i) => {
                const isSelected = selectedResponseIdx === pair.assistantIdx
                const isInactive = (selectedResponseIdx !== -1 && !isSelected) || isStreaming
                const isExpanded = expandedMsgIdx === i
                const accentColor = isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-blue-400' : 'text-blue-600'
                const activeBorder = isFallout ? 'border-green-500/50 ring-1 ring-green-500/20' : isDarkBlue ? 'border-blue-500/40 ring-1 ring-blue-500/15' : isDark ? 'border-blue-500/40 ring-1 ring-blue-500/15' : 'border-blue-400 ring-1 ring-blue-100'
                const dotColor = isFallout ? 'bg-green-400' : isDarkBlue ? 'bg-blue-400' : isDark ? 'bg-blue-400' : 'bg-blue-500'
                return (
                  <div
                    key={i}
                    className={`rounded-xl border overflow-hidden cursor-pointer transition-all duration-150 ${
                      isFallout ? 'border-green-500/20' : isDarkBlue ? 'border-[#1c2438]' : isDark ? 'border-[#2a2a2a]' : 'border-gray-200'
                    } ${isSelected ? activeBorder : ''} ${isInactive ? 'opacity-50' : ''}`}
                    onClick={() => setSelectedResponseIdx(isSelected ? -1 : pair.assistantIdx)}
                  >
                    {/* User question */}
                    <div className={`px-3 py-2.5 pb-3 text-sm ${userMsgBg}`}>
                      <div className="flex items-start gap-2">
                        {isSelected && <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />}
                        <p className="flex-1">{pair.user}</p>
                      </div>
                    </div>
                    {/* AI response */}
                    <div className={`px-3 py-2.5 text-sm ${responseBg}`} data-theme={theme}>
                      {isExpanded ? (
                        <div className="dash-ai-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(pair.assistant) }} />
                      ) : (
                        <div className="dash-ai-md max-h-[4.5em] overflow-hidden" dangerouslySetInnerHTML={{ __html: renderMarkdown(pair.assistant) }} />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedMsgIdx(isExpanded ? null : i) }}
                        className={`text-[10px] font-medium mt-1.5 ml-5 ${accentColor}`}
                      >
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Current exchange (latest user Q + streaming/done response) */}
              {(streamingText || isStreaming) && (() => {
                const lastUserMsg = chatPairs.length > 0 ? chatPairs[chatPairs.length - 1] : null
                const currentUser = lastUserMsg && lastUserMsg.assistant == null ? lastUserMsg.user : null
                const isSelected = selectedResponseIdx === -1
                const isInactive = selectedResponseIdx !== -1
                const accentColor = isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-400' : isDark ? 'text-blue-400' : 'text-blue-600'
                const activeBorder = isFallout ? 'border-green-500/50 ring-1 ring-green-500/20' : isDarkBlue ? 'border-blue-500/40 ring-1 ring-blue-500/15' : isDark ? 'border-blue-500/40 ring-1 ring-blue-500/15' : 'border-blue-400 ring-1 ring-blue-100'
                const dotColor = isFallout ? 'bg-green-400' : isDarkBlue ? 'bg-blue-400' : isDark ? 'bg-blue-400' : 'bg-blue-500'
                const hasPreviousPairs = chatPairs.some(p => p.assistant != null)
                return (
                  <div
                    className={`rounded-xl border overflow-hidden transition-all duration-150 ${
                      isFallout ? 'border-green-500/20' : isDarkBlue ? 'border-[#1c2438]' : isDark ? 'border-[#2a2a2a]' : 'border-gray-200'
                    } ${isDone && isSelected && hasPreviousPairs ? activeBorder : ''} ${isDone && isInactive ? 'opacity-50' : ''} ${isDone && hasPreviousPairs ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (isDone && hasPreviousPairs) setSelectedResponseIdx(-1) }}
                  >
                    {/* User question */}
                    {currentUser && (
                      <div className={`px-3 py-2.5 pb-3 text-sm ${userMsgBg} ${
                        isFallout ? 'border-b border-green-500/10' : isDarkBlue ? 'border-b border-[#1c2438]' : isDark ? 'border-b border-[#2a2a2a]' : 'border-b border-gray-100'
                      }`}>
                        <div className="flex items-start gap-2">
                          {isSelected && hasPreviousPairs && <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />}
                          <p className="flex-1">{currentUser}</p>
                        </div>
                      </div>
                    )}
                    {/* AI response */}
                    <div
                      ref={responseRef}
                      className={`max-h-[40vh] overflow-y-auto px-3 py-2.5 text-sm leading-relaxed ${responseBg}`}
                      data-theme={theme}
                    >
                      {streamingText ? (
                        <div className="dash-ai-md" dangerouslySetInnerHTML={{ __html: renderedResponse }} />
                      ) : (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <AIOrb state="generating" size={56} theme={theme} />
                          <span className={`text-sm font-medium ${descColor}`}>
                            {waitSeconds < 3 ? 'Thinking…' : `Thinking… ${waitSeconds}s`}
                          </span>
                          {waitSeconds >= 8 && (
                            <span className={`text-xs px-3 py-1.5 rounded-full ${
                              isFallout ? 'bg-green-500/10 text-green-400' : isDarkBlue ? 'bg-blue-500/10 text-blue-300' : isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-600'
                            }`}>
                              Larger models can take longer to start generating
                            </span>
                          )}
                        </div>
                      )}
                      {isStreaming && <span className="inline-block w-1.5 h-4 ml-0.5 animate-pulse" style={{ background: isFallout ? '#4ade80' : '#60a5fa' }} />}
                    </div>
                  </div>
                )
              })()}
              </div>
              )}
            </>
          )}
        </div>

        {/* Fixed bottom input area — only shown after chat has started */}
        {hasNote && !isEncrypted && isConnected && (chatHistory.length > 0 || isStreaming) && (
          <div className={`flex-shrink-0 px-6 py-3 space-y-2.5 ${
            isFallout ? 'border-t border-green-500/30' : isDarkBlue ? 'border-t border-[#1c2438]' : isDark ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-100'
          }`}>
            {/* Selected text context — compact, blue tint */}
            {(() => {
              if (!hasSelection) return null
              const contextMd = getContextMarkdown()
              if (!contextMd || !contextMd.trim()) return null
              const lines = contextMd.split('\n').filter(l => l.trim())
              const preview = contextMd.length > 120 ? contextMd.slice(0, 120) + '…' : contextMd
              return (
                <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed ${
                  isFallout ? 'bg-green-500/10 border-green-500/20 text-green-300/70 font-mono' : isDarkBlue ? 'bg-blue-500/10 border-blue-500/20 text-blue-200/70' : isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-200/70' : 'bg-blue-50 border-blue-200 text-blue-700/70'
                }`}>
                  <span className={`font-semibold ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-300' : isDark ? 'text-blue-300' : 'text-blue-600'}`}>Selected text</span>
                  <span className={`ml-1.5 opacity-60 ${isFallout ? 'text-green-400' : isDarkBlue ? 'text-blue-300' : isDark ? 'text-blue-300' : 'text-blue-500'}`}>· {lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
                  <p className="mt-0.5 whitespace-pre-wrap break-words line-clamp-2">{preview}</p>
                </div>
              )
            })()}

            <div className="relative">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) {
                    e.preventDefault()
                    handleSend()
                  } else if (e.key === 'Enter' && !e.shiftKey && canSend) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Ask a follow-up…"
                rows={3}
                disabled={isStreaming}
                className={`w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none disabled:opacity-50 ${inputBg}`}
              />
              <span className={`absolute bottom-1.5 right-2.5 text-[10px] ${descColor} pointer-events-none`}>
                ⏎ send · ⇧⏎ new line
              </span>
            </div>

            <button
              onClick={() => handleSend()}
              disabled={!canSend}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${btnPrimary}`}
            >
              <Send className="w-3.5 h-3.5" /> Send
            </button>
          </div>
        )}

        {/* Fixed bottom action bar — shown when response is done */}
        {isDone && streamingText && (
          <div className={`flex-shrink-0 px-6 py-3 ${
            isFallout ? 'border-t border-green-500/30' : isDarkBlue ? 'border-t border-[#1c2438]' : isDark ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-100'
          }`}>
            <div className="flex gap-2">
              {hasSelection ? (
                <button
                  onClick={() => handleInsert('replace')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnPrimary}`}
                >
                  <Replace className="w-3.5 h-3.5" /> Replace selection
                </button>
              ) : !noteHasContent ? (
                <button
                  onClick={() => handleInsert('replace')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnPrimary}`}
                >
                  <Replace className="w-3.5 h-3.5" /> Create
                </button>
              ) : null}
              <button
                onClick={() => handleInsert('append')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${hasSelection || !noteHasContent ? btnSecondary : btnPrimary}`}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" /> {noteHasContent ? 'Insert below' : 'Insert'}
              </button>
              <button
                onClick={handleCopy}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnSecondary}`}
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {onSaveAsNote && (
                <button
                  onClick={() => { onSaveAsNote(getSelectedText()); handleClose() }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnSecondary}`}
                  title="Save as new note"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Undo bar — shown after AI content was inserted */}
        {canUndo && !isDone && (
          <div className={`flex-shrink-0 px-6 py-3 ${
            isFallout ? 'border-t border-green-500/30' : isDarkBlue ? 'border-t border-[#1c2438]' : isDark ? 'border-t border-[#3a3a3a]' : 'border-t border-gray-100'
          }`}>
            <button
              onClick={onUndo}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-colors ${btnSecondary}`}
            >
              <Undo2 className="w-3.5 h-3.5" /> Undo last AI change
            </button>
          </div>
        )}
      </div>
    </>
  )
}
