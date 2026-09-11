/**
 * Importing notes from other apps, as the steps the import dialog walks
 * through: choose the app, pick its export, read it, check the preview,
 * import, then the report, with undo.
 *
 * The parsers load only when the dialog opens. Nothing is written until the
 * person confirms the preview, and an import the app stops in the middle of
 * is put right on the next launch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { beginImport } from '@/lib/import/lock'
import { devicesReadyForMigration } from '@/lib/imageMigration'
import { VAULT_LIMIT_BYTES } from '@/lib/attachmentTransferQueue'
import { hasAttachment } from '@/lib/attachmentStorage'
import { IMPORT_JOURNAL_ID } from '@/lib/import/journal'

const PROGRESS_INTERVAL_MS = 100

const loadRuntime = () => import('@/utils/noteImport')

// The colours StackedTags gives a tag that has none, so imported tags look
// the same everywhere they appear
const TAG_PALETTE = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#84CC16', '#F97316']
const tagColor = (name) => TAG_PALETTE[name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % TAG_PALETTE.length]

// The format detection compares against, for each app someone can choose
const DETECTED_AS = { obsidian: 'markdown', markdown: 'markdown' }

export default function useNoteImport ({
  pages,
  getPages,
  getTags,
  addTag,
  mergeImport,
  discardImportAttachments,
  undoImport,
  readPages,
  arePagesLoaded,
  fetchSyncUsage,
  syncEnabled = false
}) {
  const [stage, setStage] = useState('closed')
  const [sources, setSources] = useState([])
  const [source, setSource] = useState(null)
  const [problem, setProblem] = useState(null)
  const [progress, setProgress] = useState(null)
  const [plan, setPlan] = useState(null)
  const [choices, setChoices] = useState({ skipDuplicates: true, includeAuthenticator: false })
  const [syncUsage, setSyncUsage] = useState(null)
  const [report, setReport] = useState(null)
  const [undoState, setUndoState] = useState('idle')
  const [history, setHistory] = useState([])

  const runtimeRef = useRef(null)
  const pickedRef = useRef(null)
  const controllerRef = useRef(null)
  const lastProgressRef = useRef(0)
  const stageRef = useRef(stage)
  stageRef.current = stage

  const reportProgress = useCallback((value, force = false) => {
    const now = Date.now()
    if (!force && now - lastProgressRef.current < PROGRESS_INTERVAL_MS) return
    lastProgressRef.current = now
    setProgress(value)
  }, [])

  const releasePicked = useCallback(() => {
    const picked = pickedRef.current
    pickedRef.current = null
    picked?.close?.().catch(() => {})
  }, [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    releasePicked()
    setPlan(null)
    setProgress(null)
    setProblem(null)
    setSyncUsage(null)
  }, [releasePicked])

  const open = useCallback(async () => {
    reset()
    setReport(null)
    setUndoState('idle')
    setSource(null)
    setChoices({ skipDuplicates: true, includeAuthenticator: false })
    setStage('choose')
    try {
      runtimeRef.current = runtimeRef.current || await loadRuntime()
      setSources(runtimeRef.current.IMPORT_SOURCES)
      setHistory(runtimeRef.current.importHistory().filter(entry => !entry.undoneAt && Array.isArray(entry.pageIds)).slice(0, 3))
    } catch (error) {
      console.error('The importer failed to load', error)
      setProblem("The importer couldn't be loaded. Try again in a moment.")
    }
  }, [reset])

  const close = useCallback(() => {
    if (stageRef.current === 'importing') return
    reset()
    setStage('closed')
  }, [reset])

  const chooseSource = useCallback((id) => {
    const chosen = sources.find(item => item.id === id)
    if (!chosen) return
    setSource(chosen)
    setProblem(null)
    setStage('pick')
  }, [sources])

  const back = useCallback(() => {
    const current = stageRef.current
    reset()
    setStage(current === 'pick' ? 'choose' : 'pick')
  }, [reset])

  const scan = useCallback(async (picked, nextChoices) => {
    const runtime = runtimeRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    setStage('reading')
    setProblem(null)
    reportProgress({ found: 0, label: '' }, true)
    try {
      const result = await runtime.planImport({
        picked,
        folderTitle: `${source.name} import`,
        existingPages: getPages(),
        existingTags: getTags(),
        includeAuthenticator: nextChoices.includeAuthenticator,
        onProgress: value => reportProgress(value),
        signal: controller.signal
      })
      if (controller.signal.aborted) return
      if (result.notes.length + result.skipped.length + result.failed.length === 0) {
        releasePicked()
        setProblem('No notes were found in these files.')
        setStage('pick')
        return
      }
      setPlan(result)
      setStage('preview')
    } catch (error) {
      if (controller.signal.aborted) return
      console.error('Reading the export failed', error)
      releasePicked()
      setProblem(`These files couldn't be read: ${error?.message || 'unknown error'}`)
      setStage('pick')
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [source, getPages, getTags, reportProgress, releasePicked])

  const pickFiles = useCallback(async (files) => {
    const list = Array.from(files || [])
    if (list.length === 0 || !source) return
    const runtime = runtimeRef.current
    releasePicked()
    const controller = new AbortController()
    controllerRef.current = controller
    setStage('reading')
    setProblem(null)
    reportProgress(null, true)
    let picked
    try {
      picked = await runtime.readPickedFiles(list, { signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) return
      setProblem(error?.name === 'ImportSourceError' ? error.message : `These files couldn't be opened: ${error?.message || 'unknown error'}`)
      setStage('pick')
      return
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
    if (controller.signal.aborted) {
      picked.close().catch(() => {})
      return
    }
    pickedRef.current = picked
    const message = runtime.detectionMessage(DETECTED_AS[source.id] || source.id, picked.detection)
    if (message) {
      releasePicked()
      setProblem(message)
      setStage('pick')
      return
    }
    await scan(picked, choices)
  }, [source, choices, scan, reportProgress, releasePicked])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    if (stageRef.current === 'reading') {
      releasePicked()
      setProgress(null)
      setStage('pick')
    }
  }, [releasePicked])

  const setChoice = useCallback((name, value) => {
    const next = { ...choices, [name]: value }
    setChoices(next)
    if (name === 'includeAuthenticator' && pickedRef.current) scan(pickedRef.current, next)
  }, [choices, scan])

  // Sync storage, for what photos will mean for it
  useEffect(() => {
    if (stage !== 'preview' || !syncEnabled || syncUsage || !fetchSyncUsage) return
    let cancelled = false
    Promise.resolve(fetchSyncUsage()).then(usage => {
      if (!cancelled && usage) setSyncUsage(usage)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [stage, syncEnabled, syncUsage, fetchSyncUsage])

  const selection = useMemo(() => {
    const runtime = runtimeRef.current
    return plan && runtime ? runtime.selectNotes(plan, { skipDuplicates: choices.skipDuplicates }) : null
  }, [plan, choices.skipDuplicates])

  const summary = useMemo(() => {
    const runtime = runtimeRef.current
    if (!plan || !selection || !runtime) return null
    const base = runtime.summarizeSelection(plan, selection, {
      syncEnabled: Boolean(syncEnabled),
      usedBytes: typeof syncUsage?.totalBytes === 'number' ? syncUsage.totalBytes : 0,
      quotaBytes: VAULT_LIMIT_BYTES
    })
    const hasFiles = base.counts.photos + base.counts.files > 0
    const waitingOn = syncEnabled && hasFiles && Array.isArray(syncUsage?.pairedDevices)
      ? devicesReadyForMigration(syncUsage.pairedDevices).waitingOn
      : []
    return {
      ...base,
      duplicatesFound: plan.notes.filter(note => note.duplicate).length,
      authenticatorNotes: plan.skipped.filter(item => item.reason === 'authenticator').length,
      failedNotes: plan.failed,
      canStoreFiles: runtime.canImportFiles(),
      syncEnabled: Boolean(syncEnabled),
      syncUsedBytes: typeof syncUsage?.totalBytes === 'number' ? syncUsage.totalBytes : null,
      syncLimitBytes: VAULT_LIMIT_BYTES,
      devicesNeedingUpdate: waitingOn
    }
  }, [plan, selection, syncEnabled, syncUsage])

  const confirmImport = useCallback(async () => {
    const runtime = runtimeRef.current
    if (!plan || !selection || stageRef.current !== 'preview' || !runtime) return
    let release
    try {
      release = beginImport(source.name)
    } catch {
      setProblem('Another import is already running.')
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setProblem(null)
    setStage('importing')
    reportProgress({ phase: 'files', done: 0, total: selection.importing.length }, true)
    try {
      const result = await runtime.runImport(plan, selection, {
        mergeImport,
        discardImportAttachments,
        readPages,
        addTags: names => { for (const name of names) addTag({ name, color: tagColor(name) }) },
        format: source.id,
        onProgress: value => reportProgress(value, value.phase === 'saving'),
        signal: controller.signal
      })
      releasePicked()
      setPlan(null)
      setReport(result)
      setStage('report')
    } catch (error) {
      console.error('Import failed', error)
      setProblem(controller.signal.aborted
        ? 'Import cancelled. No notes were added.'
        : `The import didn't finish, and no notes were added: ${error?.message || 'unknown error'}`)
      setStage('preview')
    } finally {
      release()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [plan, selection, source, mergeImport, discardImportAttachments, readPages, addTag, reportProgress, releasePicked])

  const undo = useCallback(async () => {
    if (!report || undoState === 'working') return
    setUndoState('working')
    try {
      await undoImport({ folderId: report.folderId, pageIds: report.pageIds })
      runtimeRef.current?.markImportUndone(report.importId)
      setUndoState('done')
    } catch (error) {
      console.error('Undoing the import failed', error)
      setUndoState('error')
    }
  }, [report, undoState, undoImport])

  // Undoing an earlier import, from the list on the first step
  const undoPastImport = useCallback(async (entry) => {
    try {
      // An entry that gave up its note list to fit storage goes by its folder
      const pageIds = entry.pageIds || (getPages?.() || []).filter(page => page?.folderId === entry.folderId).map(page => page.id)
      await undoImport({ folderId: entry.folderId, pageIds })
      runtimeRef.current?.markImportUndone(entry.importId)
      setHistory(list => list.filter(item => item.importId !== entry.importId))
      return true
    } catch (error) {
      console.error('Undoing an earlier import failed', error)
      return false
    }
  }, [undoImport, getPages])

  const copyReport = useCallback(async () => {
    if (!report) return false
    const { reportText } = await import('@/lib/import/messages')
    try {
      await navigator.clipboard.writeText(reportText(report))
      return true
    } catch {
      return false
    }
  }, [report])

  // An import the app stopped in the middle of: finish it off once notes load
  const recoveredRef = useRef(false)
  useEffect(() => {
    if (recoveredRef.current || !arePagesLoaded?.()) return
    recoveredRef.current = true
    // The parsers load only when there is a journal to act on
    hasAttachment(IMPORT_JOURNAL_ID)
      .then(journaled => journaled ? loadRuntime().then(runtime => runtime.recoverInterruptedImport({ readPages, discardImportAttachments })) : null)
      .then(result => { if (result && result.outcome !== 'none') console.info('Import journal:', result.outcome) })
      .catch(error => console.error('Putting right an interrupted import failed', error))
  }, [pages, arePagesLoaded, readPages, discardImportAttachments])

  useEffect(() => () => {
    controllerRef.current?.abort()
    pickedRef.current?.close?.().catch(() => {})
  }, [])

  return {
    stage,
    isOpen: stage !== 'closed',
    sources,
    source,
    problem,
    progress,
    summary,
    choices,
    report,
    undoState,
    history,
    open,
    close,
    chooseSource,
    back,
    pickFiles,
    cancel,
    setChoice,
    confirmImport,
    undo,
    undoPastImport,
    copyReport
  }
}
