import React, { useState, useEffect, useCallback } from 'react'
import { X, Shield, Plus, Trash2, FileText, AlertCircle, Check, Lock } from 'lucide-react'
import { readDecoyPages, saveDecoyPages } from '@/lib/storage'
import { encryptJsonWithPassphrase, decryptJsonWithPassphrase } from '@/utils/cryptoUtils'

function createDefaultDecoyNotes () {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Shopping List',
      content: { time: Date.now(), blocks: [
        { type: 'paragraph', data: { text: 'Milk, eggs, bread' } },
        { type: 'paragraph', data: { text: 'Chicken breast' } },
        { type: 'paragraph', data: { text: 'Vegetables - broccoli, carrots, spinach' } },
        { type: 'paragraph', data: { text: 'Rice and pasta' } }
      ] },
      tags: [], tagNames: [], createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), password: null, folderId: null
    },
    {
      id: crypto.randomUUID(),
      title: 'Meeting Notes',
      content: { time: Date.now(), blocks: [
        { type: 'header', data: { text: 'Weekly standup', level: 3 } },
        { type: 'paragraph', data: { text: 'Discussed project timeline and deliverables' } },
        { type: 'paragraph', data: { text: 'Next steps: follow up with team on Thursday' } }
      ] },
      tags: [], tagNames: [], createdAt: new Date(Date.now() - 86400000).toISOString(), password: null, folderId: null
    },
    {
      id: crypto.randomUUID(),
      title: 'Recipe Ideas',
      content: { time: Date.now(), blocks: [
        { type: 'paragraph', data: { text: 'Pasta carbonara - need to try the authentic recipe' } },
        { type: 'paragraph', data: { text: 'Thai green curry' } },
        { type: 'paragraph', data: { text: 'Banana bread - grandma\'s recipe' } }
      ] },
      tags: [], tagNames: [], createdAt: new Date(Date.now() - 86400000 * 7).toISOString(), password: null, folderId: null
    }
  ]
}

export default function DecoyVaultSetupModal ({ isOpen, onClose, theme }) {
  const [duressPassword, setDuressPassword] = useState('')
  const [decoyNotes, setDecoyNotes] = useState([])
  const [unlocked, setUnlocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingNote, setEditingNote] = useState(null) // { index, title, text }
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setDuressPassword('')
      setDecoyNotes([])
      setUnlocked(false)
      setError('')
      setSuccess('')
      setEditingNote(null)
      setSaved(false)
    }
  }, [isOpen])

  const handleUnlock = useCallback(async () => {
    if (!duressPassword.trim()) { setError('Enter your decoy password'); return }
    setLoading(true)
    setError('')
    try {
      const encrypted = await readDecoyPages()
      if (encrypted) {
        const decrypted = await decryptJsonWithPassphrase(encrypted, duressPassword)
        setDecoyNotes(Array.isArray(decrypted) ? decrypted : [])
      } else {
        // No decoy notes yet — start with defaults
        setDecoyNotes(createDefaultDecoyNotes())
      }
      setUnlocked(true)
    } catch (err) {
      if (err.name === 'DecryptionError' || err.message.includes('passphrase')) {
        setError('Wrong decoy password')
      } else {
        // No existing data or first time — use defaults
        setDecoyNotes(createDefaultDecoyNotes())
        setUnlocked(true)
      }
    }
    setLoading(false)
  }, [duressPassword])

  const handleSave = useCallback(async () => {
    if (decoyNotes.length === 0) {
      setError('Add at least one decoy note — an empty vault defeats the purpose')
      return
    }
    setLoading(true)
    setError('')
    try {
      const encrypted = await encryptJsonWithPassphrase(decoyNotes, duressPassword)
      await saveDecoyPages(encrypted)
      setSaved(true)
    } catch (err) {
      setError('Failed to save: ' + err.message)
    }
    setLoading(false)
  }, [decoyNotes, duressPassword])

  const addNote = () => {
    const newNote = {
      id: crypto.randomUUID(),
      title: 'New Note',
      content: { time: Date.now(), blocks: [{ type: 'paragraph', data: { text: '' } }] },
      tags: [], tagNames: [], createdAt: new Date().toISOString(), password: null, folderId: null
    }
    setDecoyNotes(prev => [...prev, newNote])
  }

  const removeNote = (index) => {
    setDecoyNotes(prev => prev.filter((_, i) => i !== index))
  }

  const startEditing = (index) => {
    const note = decoyNotes[index]
    const text = (note.content?.blocks || [])
      .map(b => b.data?.text || '')
      .filter(Boolean)
      .join('\n')
    setEditingNote({ index, title: note.title, text })
  }

  const saveEditing = () => {
    if (!editingNote) return
    const blocks = editingNote.text.split('\n').filter(Boolean).map(line => ({
      type: 'paragraph', data: { text: line }
    }))
    setDecoyNotes(prev => prev.map((note, i) =>
      i === editingNote.index
        ? { ...note, title: editingNote.title, content: { time: Date.now(), blocks } }
        : note
    ))
    setEditingNote(null)
  }

  if (!isOpen) return null

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const containerClass = isFallout
    ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
    : isDarkBlue
      ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
      : isDark
        ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
        : 'bg-white border border-gray-200 shadow-2xl'
  const textClass = isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-gray-900'
  const subtextClass = isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#6b6b6b]' : 'text-gray-500'
  const inputClass = `w-full px-3 py-2.5 rounded-xl text-sm transition-all ${
    isFallout ? 'bg-gray-800 border border-green-500/30 text-green-400 font-mono focus:border-green-500/60'
      : isDarkBlue ? 'bg-[#0c1017] border border-[#1c2438] text-[#e0e6f0] focus:border-blue-500/50'
        : isDark ? 'bg-[#0d0d0d] border border-[#3a3a3a] text-[#ececec] focus:border-[#555]'
          : 'bg-gray-50 border border-gray-200 text-gray-900 focus:border-blue-300'
  }`
  const btnClass = isFallout
    ? 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20'
    : isDarkBlue
      ? 'bg-[#1a2035] border border-[#1c2438] text-[#e0e6f0] hover:bg-[#232b42]'
      : isDark
        ? 'bg-[#262626] border border-[#3a3a3a] text-[#ececec] hover:bg-[#333]'
        : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
  const primaryBtn = isFallout
    ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono'
    : isDarkBlue
      ? 'bg-blue-500 text-white hover:bg-blue-400'
      : isDark
        ? 'bg-blue-600 text-white hover:bg-blue-500'
        : 'bg-blue-600 text-white hover:bg-blue-700'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }} />

      <div style={{ animation: 'dash-modal-in 150ms ease-out forwards' }} className={`relative w-full max-w-md rounded-2xl p-6 max-h-[80vh] overflow-y-auto ${containerClass}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isFallout ? 'bg-green-900/40' : isDarkBlue ? 'bg-blue-900/20' : isDark ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
              <Shield className={`h-5 w-5 ${isFallout ? 'text-green-400' : 'text-blue-500'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${textClass}`}>Decoy Vault</h2>
              <p className={`text-xs ${subtextClass}`}>Notes shown when duress password is entered</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition-colors ${btnClass}`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {!unlocked ? (
          /* Password entry to unlock decoy editing */
          <div className="space-y-3">
            <p className={`text-sm ${subtextClass}`}>
              Enter your decoy password to manage decoy notes.
            </p>
            <div className="relative">
              <input
                type="password"
                value={duressPassword}
                onChange={(e) => { setDuressPassword(e.target.value); setError('') }}
                placeholder="Decoy password..."
                className={inputClass}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                autoFocus
              />
              <Lock className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 ${subtextClass}`} />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </div>
            )}
            <button
              onClick={handleUnlock}
              disabled={loading || !duressPassword.trim()}
              className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 ${primaryBtn}`}
            >
              {loading ? 'Unlocking...' : 'Unlock Decoy Vault'}
            </button>
          </div>
        ) : saved ? (
          /* Post-save confirmation */
          <div className="space-y-4 text-center py-2">
            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${isFallout ? 'bg-green-900/40' : isDarkBlue ? 'bg-green-900/20' : isDark ? 'bg-green-900/20' : 'bg-green-50'}`}>
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <h3 className={`text-base font-semibold mb-1 ${textClass}`}>Decoy notes saved</h3>
              <p className={`text-sm ${subtextClass}`}>
                To access your decoy notes, lock the app and enter your decoy password at the lock screen.
              </p>
            </div>
            <button
              onClick={onClose}
              className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${primaryBtn}`}
            >
              Done
            </button>
          </div>
        ) : editingNote ? (
          /* Editing a single note */
          <div className="space-y-3">
            <input
              type="text"
              value={editingNote.title}
              onChange={(e) => setEditingNote(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Note title..."
              className={inputClass}
              autoFocus
            />
            <textarea
              value={editingNote.text}
              onChange={(e) => setEditingNote(prev => ({ ...prev, text: e.target.value }))}
              placeholder="Note content (one paragraph per line)..."
              rows={8}
              className={`${inputClass} resize-none`}
            />
            <div className="flex gap-2">
              <button onClick={() => setEditingNote(null)} className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium ${btnClass}`}>
                Cancel
              </button>
              <button onClick={saveEditing} className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium ${primaryBtn}`}>
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Note list */
          <div className="space-y-3">
            <p className={`text-xs ${subtextClass}`}>
              These notes appear when the duress password is entered. Make them look realistic.
            </p>

            <div className="space-y-2">
              {decoyNotes.map((note, i) => (
                <div key={note.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${
                  isFallout ? 'bg-gray-800/60 border border-green-500/20'
                    : isDarkBlue ? 'bg-[#0c1017] border border-[#1c2438]'
                      : isDark ? 'bg-[#0d0d0d] border border-[#2a2a2a]'
                        : 'bg-gray-50 border border-gray-200'
                }`}>
                  <FileText className={`h-4 w-4 flex-shrink-0 ${subtextClass}`} />
                  <button
                    onClick={() => startEditing(i)}
                    className={`flex-1 text-left text-sm truncate ${textClass} hover:opacity-80`}
                  >
                    {note.title || 'Untitled'}
                  </button>
                  <button
                    onClick={() => removeNote(i)}
                    className="p-1 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button onClick={addNote} className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm ${btnClass}`}>
              <Plus className="h-3.5 w-3.5" /> Add Note
            </button>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Check className="h-3.5 w-3.5" /> {success}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={loading}
              className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 ${primaryBtn}`}
            >
              {loading ? 'Saving...' : 'Save Decoy Notes'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
