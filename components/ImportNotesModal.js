import React, { useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Copy, FolderOpen, Import, Loader2, Undo2, X } from 'lucide-react'
import {
  failureMessage, formatBytes, formatMinutes, issueMessage, noticeMessage, resourceProblemMessage, skipMessage
} from '@/lib/import/messages'

/**
 * Import notes from other apps: choose the app, pick its export, check what
 * will happen, import, and see the report with undo. The steps live in
 * hooks/useNoteImport.js. Theme matches TrashModal.
 */

function themeClasses (theme) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'
  return {
    isFallout,
    panel: isFallout
      ? 'bg-gray-900 border-2 border-green-500/60 shadow-[0_0_40px_rgba(34,197,94,0.15)]'
      : isDarkBlue ? 'bg-[#141825] border border-[#1c2438] shadow-2xl'
        : isDark ? 'bg-[#1a1a1a] border border-[#3a3a3a]/50 shadow-2xl'
          : 'bg-white shadow-2xl',
    divider: isFallout ? 'border-green-500/30' : isDarkBlue ? 'border-[#1c2438]' : isDark ? 'border-[#3a3a3a]' : 'border-gray-100',
    title: isFallout ? 'text-green-400 font-mono' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-white' : 'text-gray-900',
    body: isFallout ? 'text-green-500 font-mono' : isDarkBlue ? 'text-[#b4c0d6]' : isDark ? 'text-[#c0c0c0]' : 'text-gray-600',
    muted: isFallout ? 'text-green-700 font-mono' : isDarkBlue ? 'text-[#8b99b5]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500',
    closeButton: isFallout ? 'text-green-600 hover:bg-green-900/30'
      : isDarkBlue ? 'text-[#8b99b5] hover:bg-[#232b42]'
        : isDark ? 'text-[#c0c0c0] hover:bg-[#2a2a2a]'
          : 'text-gray-500 hover:bg-gray-100',
    icon: isFallout ? 'bg-green-500/10 border border-green-500/40 text-green-400'
      : isDarkBlue ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
        : isDark ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
          : 'bg-blue-50 border border-blue-200 text-blue-600',
    card: isFallout ? 'bg-gray-800/50 border border-green-500/20'
      : isDarkBlue ? 'bg-[#0c1017] border border-[#1c2438]'
        : isDark ? 'bg-[#222] border border-[#3a3a3a]/40'
          : 'bg-gray-50 border border-gray-100',
    cardHover: isFallout ? 'hover:border-green-500/50' : isDarkBlue ? 'hover:bg-[#1a2035]' : isDark ? 'hover:bg-[#2a2a2a]' : 'hover:bg-gray-100',
    label: isFallout ? 'text-green-600 font-mono text-[10px] uppercase tracking-wider'
      : isDarkBlue ? 'text-[#5d6b88] text-[10px] uppercase tracking-wider font-medium'
        : isDark ? 'text-[#8e8e8e] text-[10px] uppercase tracking-wider font-medium'
          : 'text-gray-400 text-[10px] uppercase tracking-wider font-medium',
    primary: isFallout ? 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono'
      : isDarkBlue ? 'bg-blue-500 text-white hover:bg-blue-400'
        : isDark ? 'bg-blue-600 text-white hover:bg-blue-500'
          : 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: isFallout ? 'bg-gray-800 border border-green-500/40 text-green-400 hover:bg-gray-700 font-mono'
      : isDarkBlue ? 'bg-[#1a2035] border border-[#1c2438] text-[#8b99b5] hover:bg-[#232b42]'
        : isDark ? 'bg-[#2f2f2f] border border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#3a3a3a]'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    danger: isFallout ? 'bg-red-900/40 border border-red-500/40 text-red-400 hover:bg-red-900/60 font-mono'
      : 'bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20',
    warning: isFallout ? 'bg-yellow-900/30 border border-yellow-500/40 text-yellow-300 font-mono'
      : isDarkBlue || isDark ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
        : 'bg-amber-50 border border-amber-200 text-amber-800',
    problem: isFallout ? 'bg-red-900/30 border border-red-500/40 text-red-300 font-mono'
      : isDarkBlue || isDark ? 'bg-red-500/10 border border-red-500/30 text-red-300'
        : 'bg-red-50 border border-red-200 text-red-700',
    track: isFallout ? 'bg-gray-800' : isDarkBlue ? 'bg-[#0c1017]' : isDark ? 'bg-[#2a2a2a]' : 'bg-gray-100',
    bar: isFallout ? 'bg-green-500' : 'bg-blue-500',
    checkbox: isFallout ? 'accent-green-500' : 'accent-blue-600'
  }
}

const count = (n) => Number(n || 0).toLocaleString()

const isIOS = () => typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

const PICK_LABELS = {
  evernote: 'Choose .enex files',
  notion: 'Choose the export zip',
  obsidian: 'Choose files or a zip',
  notesnook: 'Choose the export zip',
  'standard-notes': 'Choose the backup',
  markdown: 'Choose files or a zip'
}

function Callout ({ tone, children, c }) {
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg text-xs leading-relaxed ${tone === 'problem' ? c.problem : c.warning}`}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px pointer-events-none" />
      <div>{children}</div>
    </div>
  )
}

function Lines ({ title, lines, c }) {
  if (lines.length === 0) return null
  return (
    <section className="space-y-1.5">
      <h3 className={c.label}>{title}</h3>
      <ul className="space-y-1">
        {lines.map(({ key, text, names }) => (
          <li key={key} className={`text-xs leading-relaxed ${c.body}`}>
            {names && names.length > 0 ? (
              <details>
                <summary className="cursor-pointer select-none">{text}</summary>
                <p className={`mt-1 pl-3 ${c.muted}`}>{names.slice(0, 50).join(', ')}{names.length > 50 ? ', …' : ''}</p>
              </details>
            ) : text}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecentImport ({ entry, importer, c }) {
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)
  const notes = entry.counts?.imported ?? entry.pageIds.length
  const when = new Date(entry.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (!confirming) {
    return (
      <div className={`flex items-center justify-between gap-3 p-3 rounded-lg ${c.card}`}>
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${c.title}`}>{entry.folderTitle}</p>
          <p className={`text-[11px] ${c.muted}`}>{count(notes)} {notes === 1 ? 'note' : 'notes'} · {when}</p>
        </div>
        <button type="button" onClick={() => setConfirming(true)} className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 flex-shrink-0 ${c.secondary}`}>
          <Undo2 className="w-3 h-3 pointer-events-none" />
          Undo
        </button>
      </div>
    )
  }
  return (
    <div className={`p-3 rounded-lg space-y-2 ${c.card}`}>
      <p className={`text-xs leading-relaxed ${c.body}`}>
        Move the {count(notes)} {notes === 1 ? 'note' : 'notes'} from {entry.folderTitle} to Trash and remove the folder? Changes made to them since go too, and you can restore them from Trash for 30 days.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setConfirming(false)} className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium ${c.secondary}`}>Keep them</button>
        <button
          type="button"
          disabled={working}
          onClick={async () => {
            setWorking(true)
            setFailed(false)
            const done = await importer.undoPastImport(entry)
            setWorking(false)
            if (!done) setFailed(true)
          }}
          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50 ${c.danger}`}
        >
          {working ? 'Moving…' : 'Move to Trash'}
        </button>
      </div>
      {failed && <p className="text-xs text-red-500">The notes couldn&apos;t be moved. Try again.</p>}
    </div>
  )
}

function ChooseStep ({ importer, c, onOpenBackup }) {
  return (
    <div className="space-y-4">
      <p className={`text-sm leading-relaxed ${c.body}`}>
        Notes arrive in a new folder. You&apos;ll see what will be imported, and anything that can&apos;t come across exactly, before anything changes.
      </p>
      <div className="grid gap-1.5">
        {importer.sources.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => importer.chooseSource(item.id)}
            className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-lg text-left transition-colors ${c.card} ${c.cardHover}`}
          >
            <span className={`text-sm font-medium ${c.title}`}>{item.name}</span>
            <ChevronRight className={`w-4 h-4 pointer-events-none ${c.muted}`} />
          </button>
        ))}
      </div>
      {importer.history.length > 0 && (
        <section className="space-y-1.5">
          <h3 className={c.label}>Recent imports</h3>
          {importer.history.map(entry => <RecentImport key={entry.importId} entry={entry} importer={importer} c={c} />)}
        </section>
      )}
      {onOpenBackup && (
        <p className={`text-xs leading-relaxed ${c.muted}`}>
          Importing a lot?{' '}
          <button type="button" onClick={onOpenBackup} className="underline underline-offset-2">Back up your notes first</button>.
        </p>
      )}
    </div>
  )
}

function PickStep ({ importer, c }) {
  const filesInput = useRef(null)
  const folderInput = useRef(null)
  const { source } = importer
  const takeFiles = (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    importer.pickFiles(files)
  }
  return (
    <div className="space-y-4">
      <p className={`text-sm leading-relaxed ${c.body}`}>{source.help}</p>
      {importer.problem && <Callout tone="problem" c={c}>{importer.problem}</Callout>}
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={() => filesInput.current?.click()} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium ${c.primary}`}>
          {PICK_LABELS[source.id] || 'Choose files'}
        </button>
        {source.folder && !isIOS() && (
          <button type="button" onClick={() => folderInput.current?.click()} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${c.secondary}`}>
            <FolderOpen className="w-4 h-4 pointer-events-none" />
            Choose a folder
          </button>
        )}
      </div>
      <input ref={filesInput} type="file" multiple accept={isIOS() ? undefined : source.accept} className="hidden" onChange={takeFiles} />
      {source.folder && <input ref={folderInput} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={takeFiles} />}
    </div>
  )
}

function ReadingStep ({ importer, c }) {
  const found = importer.progress?.found || 0
  return (
    <div className="py-8 text-center">
      <Loader2 className={`w-6 h-6 mx-auto motion-safe:animate-spin pointer-events-none ${c.muted}`} />
      <p className={`mt-3 text-sm ${c.title}`} aria-live="polite">{found > 0 ? `Reading notes: ${count(found)} so far` : 'Opening the files…'}</p>
      <p className={`mt-1 text-xs truncate ${c.muted}`}>{importer.progress?.label || ' '}</p>
      <button type="button" onClick={importer.cancel} className={`mt-5 px-4 py-2 rounded-lg text-xs font-medium ${c.secondary}`}>Cancel</button>
    </div>
  )
}

function PreviewStep ({ importer, c }) {
  const { summary, choices } = importer
  const { counts } = summary
  const blockedByStorage = !summary.canStoreFiles && counts.photos + counts.files > 0
  const storage = summary.storage

  const skippedLines = Object.entries(summary.skippedReasons)
    .filter(([reason]) => !['in-dash', 'in-import', 'imported-before'].includes(reason))
    .map(([reason, n]) => ({ key: reason, text: skipMessage(reason, n) }))
  if (summary.failedNotes.length > 0) {
    skippedLines.push({
      key: 'failed',
      text: `${count(summary.failedNotes.length)} ${summary.failedNotes.length === 1 ? "note couldn't" : "notes couldn't"} be read`,
      names: summary.failedNotes.map(item => `${item.title} (${failureMessage(item.reason)})`)
    })
  }
  const issueLines = Object.entries(summary.issues).map(([code, value]) => ({ key: code, text: issueMessage(code, value.count), names: value.notes }))

  return (
    <div className="space-y-5">
      <p className={`text-sm leading-relaxed ${c.title}`}>
        {counts.importing > 0
          ? <>{count(counts.importing)} {counts.importing === 1 ? 'note' : 'notes'} will be added to a new folder, <strong>{summary.folderTitle}</strong>.</>
          : 'There is nothing new to import: every note here is already in Dash.'}
      </p>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Notes', counts.importing], ['Photos', counts.photos], ['Files', counts.files]].map(([label, value]) => (
          <div key={label} className={`p-2.5 rounded-lg ${c.card}`}>
            <div className={`text-base font-semibold tabular-nums ${c.title}`}>{count(value)}</div>
            <div className={`text-[11px] ${c.muted}`}>{label}</div>
          </div>
        ))}
      </div>

      {importer.problem && <Callout tone="problem" c={c}>{importer.problem}</Callout>}
      {blockedByStorage && (
        <Callout c={c}>This browser can&apos;t store photos and files, so they couldn&apos;t come across. Import in the Dash app to keep them.</Callout>
      )}

      {(summary.duplicatesFound > 0 || summary.authenticatorNotes > 0 || choices.includeAuthenticator) && (
        <section className="space-y-2">
          {summary.duplicatesFound > 0 && (
            <label className={`flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer ${c.body}`}>
              <input type="checkbox" className={`mt-0.5 ${c.checkbox}`} checked={choices.skipDuplicates} onChange={event => importer.setChoice('skipDuplicates', event.target.checked)} />
              <span>Skip {count(summary.duplicatesFound)} {summary.duplicatesFound === 1 ? 'note that is' : 'notes that are'} already in Dash or appear twice in the export</span>
            </label>
          )}
          {(summary.authenticatorNotes > 0 || choices.includeAuthenticator) && (
            <label className={`flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer ${c.body}`}>
              <input type="checkbox" className={`mt-0.5 ${c.checkbox}`} checked={choices.includeAuthenticator} onChange={event => importer.setChoice('includeAuthenticator', event.target.checked)} />
              <span>Also import 2FA notes. They hold the secrets that sign you in to other accounts, so anyone who can open your notes could use them.</span>
            </label>
          )}
        </section>
      )}

      {counts.photos > 0 && summary.canStoreFiles && (
        <section className="space-y-1.5">
          <h3 className={c.label}>Photos and files</h3>
          <p className={`text-xs leading-relaxed ${c.body}`}>Location and camera details are removed from photos. They keep their full quality unless one is over 10 MB, which is made just small enough to fit.</p>
          {storage.tooLargeFiles.length > 0 && (
            <p className={`text-xs leading-relaxed ${c.body}`}>
              {count(storage.tooLargeFiles.length)} {storage.tooLargeFiles.length === 1 ? 'file is' : 'files are'} over 10 MB and won&apos;t be imported: {storage.tooLargeFiles.map(file => file.name).join(', ')}.
            </p>
          )}
          {summary.syncEnabled && (
            <p className={`text-xs leading-relaxed ${c.body}`}>
              They&apos;ll use about {formatBytes(storage.syncBytes)} of your {formatBytes(summary.syncLimitBytes)} sync storage
              {summary.syncUsedBytes !== null ? ` (${formatBytes(summary.syncUsedBytes)} used now)` : ''} and take {formatMinutes(storage.syncMinutes)} to reach your other devices.
              {storage.waitingForRoom > 0 ? ` ${count(storage.waitingForRoom)} won't sync until there's room.` : ''}
            </p>
          )}
          {summary.devicesNeedingUpdate.length > 0 && (
            <Callout c={c}>
              Update Dash on {summary.devicesNeedingUpdate.map(device => device.deviceName || 'another device').join(', ')} to see imported photos there.
            </Callout>
          )}
        </section>
      )}

      <Lines c={c} title="Not imported" lines={skippedLines} />
      <Lines c={c} title="Changes to know about" lines={issueLines} />

      {(summary.tags.added.length > 0 || summary.tags.shortened.length > 0) && (
        <Lines
          c={c}
          title="Tags"
          lines={[
            ...(summary.tags.added.length > 0 ? [{ key: 'added', text: `${count(summary.tags.added.length)} new ${summary.tags.added.length === 1 ? 'tag' : 'tags'}`, names: summary.tags.added }] : []),
            ...(summary.tags.shortened.length > 0 ? [{ key: 'shortened', text: `${count(summary.tags.shortened.length)} ${summary.tags.shortened.length === 1 ? 'tag was' : 'tags were'} shortened to 15 characters`, names: summary.tags.shortened.map(tag => `${tag.from} → ${tag.to}`) }] : [])
          ]}
        />
      )}

      {summary.samples.length > 0 && (
        <details>
          <summary className={`cursor-pointer select-none ${c.label}`}>Some of the notes</summary>
          <ul className="mt-2 space-y-1.5">
            {summary.samples.map((sample, index) => (
              <li key={index} className={`p-2.5 rounded-lg ${c.card}`}>
                <p className={`text-xs font-medium truncate ${c.title}`}>{sample.title}</p>
                {sample.snippet && <p className={`text-[11px] truncate ${c.muted}`}>{sample.snippet}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function ImportingStep ({ importer, c }) {
  const { progress } = importer
  const saving = progress?.phase === 'saving'
  const fraction = saving ? 1 : progress?.total ? progress.done / progress.total : 0
  return (
    <div className="py-6 space-y-4">
      <p className={`text-sm ${c.title}`} aria-live="polite">
        {saving ? 'Saving the notes…' : `Storing photos and files: ${count(progress?.done)} of ${count(progress?.total)} notes`}
      </p>
      <div className={`h-1.5 rounded-full overflow-hidden ${c.track}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
        <div className={`h-full rounded-full transition-[width] duration-300 ${c.bar}`} style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
      <p className={`text-xs ${c.muted}`}>Keep Dash open until this finishes.</p>
      {!saving && <button type="button" onClick={importer.cancel} className={`px-4 py-2 rounded-lg text-xs font-medium ${c.secondary}`}>Cancel</button>}
    </div>
  )
}

function ReportStep ({ importer, c, onOpenNote }) {
  const { report, undoState } = importer
  const [confirmingUndo, setConfirmingUndo] = useState(false)
  const [copied, setCopied] = useState(false)
  const skipped = {}
  for (const item of report.notes.skipped) skipped[item.reason] = (skipped[item.reason] || 0) + 1
  for (const item of report.notes.duplicates) skipped[item.kind] = (skipped[item.kind] || 0) + 1
  const leftOut = Object.entries(skipped).map(([reason, n]) => ({ key: reason, text: skipMessage(reason, n) }))
  if (report.unusedFiles.length > 0) leftOut.push({ key: 'unused', text: skipMessage('not-used', report.unusedFiles.length), names: report.unusedFiles.map(file => file.path) })
  if (report.notes.failed.length > 0) {
    leftOut.push({ key: 'failed', text: `${count(report.notes.failed.length)} ${report.notes.failed.length === 1 ? "note couldn't" : "notes couldn't"} be imported`, names: report.notes.failed.map(item => `${item.title} (${failureMessage(item.reason)})`) })
  }
  const files = [
    { key: 'stored', text: report.resources.stored === 1 ? '1 photo or file stored' : `${count(report.resources.stored)} photos and files stored` },
    ...report.resources.failed.map((item, index) => ({ key: `failed-${index}`, text: `${item.name} in "${item.note}" ${resourceProblemMessage(item.reason)}` })),
    ...Object.entries(report.resources.notices).map(([code, names]) => ({ key: code, text: noticeMessage(code, names.length), names }))
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5">
        <Check className="w-5 h-5 flex-shrink-0 text-green-500 pointer-events-none" />
        <p className={`text-sm leading-relaxed ${c.title}`}>
          Imported {count(report.notes.imported)} {report.notes.imported === 1 ? 'note' : 'notes'} into <strong>{report.folderTitle}</strong>.
        </p>
      </div>
      <Lines c={c} title="Not imported" lines={leftOut} />
      {(report.resources.stored > 0 || report.resources.failed.length > 0) && <Lines c={c} title="Photos and files" lines={files} />}

      <section className={`p-3 rounded-lg space-y-2 ${c.card}`}>
        {undoState === 'done' ? (
          <p className={`text-xs ${c.body}`}>The imported notes are in Trash, and the folder is gone. You can restore them from Trash for 30 days.</p>
        ) : confirmingUndo ? (
          <>
            <p className={`text-xs leading-relaxed ${c.body}`}>Move these {count(report.notes.imported)} notes to Trash and remove the folder? Any changes you made to them go too, and you can restore them from Trash for 30 days.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmingUndo(false)} className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium ${c.secondary}`}>Keep them</button>
              <button type="button" disabled={undoState === 'working'} onClick={importer.undo} className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50 ${c.danger}`}>
                {undoState === 'working' ? 'Moving…' : 'Move to Trash'}
              </button>
            </div>
            {undoState === 'error' && <p className="text-xs text-red-500">The notes couldn&apos;t be moved. Try again.</p>}
          </>
        ) : (
          <button type="button" onClick={() => setConfirmingUndo(true)} className={`w-full px-3 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 ${c.secondary}`}>
            <Undo2 className="w-3.5 h-3.5 pointer-events-none" />
            Undo import
          </button>
        )}
      </section>

      <div className="flex flex-col sm:flex-row gap-2">
        {report.pageIds.length > 0 && undoState !== 'done' && (
          <button type="button" onClick={() => onOpenNote?.(report.pageIds[0])} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium ${c.primary}`}>Open the notes</button>
        )}
        <button
          type="button"
          onClick={async () => {
            if (await importer.copyReport()) {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }
          }}
          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${c.secondary}`}
        >
          {copied ? <Check className="w-4 h-4 pointer-events-none" /> : <Copy className="w-4 h-4 pointer-events-none" />}
          {copied ? 'Copied' : 'Copy report'}
        </button>
      </div>
    </div>
  )
}

const TITLES = {
  choose: 'Import notes',
  pick: (source) => `Import from ${source?.name}`,
  reading: (source) => `Import from ${source?.name}`,
  preview: 'Check before importing',
  importing: 'Importing',
  report: 'Import finished'
}

export default function ImportNotesModal ({ importer, theme, onOpenNote, onOpenBackup }) {
  if (!importer?.isOpen) return null
  const c = themeClasses(theme)
  const { stage } = importer
  const title = typeof TITLES[stage] === 'function' ? TITLES[stage](importer.source) : TITLES[stage]
  const canGoBack = stage === 'pick' || stage === 'preview'
  const canClose = stage !== 'importing'

  return (
    <div className="dash-mobile-bottom-sheet fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={canClose ? importer.close : undefined}
        style={{ animation: 'dash-backdrop-in 150ms ease-out forwards' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-notes-title"
        className={`transform relative w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[90vh] ${c.panel}`}
        style={{ animation: 'dash-modal-in 150ms ease-out forwards' }}
      >
        <div className={`px-6 pt-6 pb-4 border-b ${c.divider}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {canGoBack ? (
                <button type="button" onClick={importer.back} className={`p-2 -ml-2 rounded-lg transition-colors ${c.closeButton}`} aria-label="Back">
                  <ArrowLeft className="w-4 h-4 pointer-events-none" />
                </button>
              ) : (
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.icon}`}>
                  <Import className="w-5 h-5 pointer-events-none" />
                </div>
              )}
              <h2 id="import-notes-title" className={`text-lg font-semibold truncate ${c.title}`}>{title}</h2>
            </div>
            {canClose && (
              <button type="button" onClick={importer.close} className={`p-2 rounded-lg transition-colors ${c.closeButton}`} aria-label="Close">
                <X className="w-4 h-4 pointer-events-none" />
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          {stage === 'choose' && (
            <>
              {importer.problem && <div className="mb-4"><Callout tone="problem" c={c}>{importer.problem}</Callout></div>}
              <ChooseStep importer={importer} c={c} onOpenBackup={onOpenBackup} />
            </>
          )}
          {stage === 'pick' && importer.source && <PickStep importer={importer} c={c} />}
          {stage === 'reading' && <ReadingStep importer={importer} c={c} />}
          {stage === 'preview' && importer.summary && <PreviewStep importer={importer} c={c} />}
          {stage === 'importing' && <ImportingStep importer={importer} c={c} />}
          {stage === 'report' && importer.report && <ReportStep importer={importer} c={c} onOpenNote={onOpenNote} />}
        </div>

        {stage === 'preview' && importer.summary && (
          <div className={`px-6 py-4 border-t flex gap-2 ${c.divider}`}>
            <button type="button" onClick={importer.back} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium ${c.secondary}`}>Choose other files</button>
            <button
              type="button"
              onClick={importer.confirmImport}
              disabled={importer.summary.counts.importing === 0 || (!importer.summary.canStoreFiles && importer.summary.counts.photos + importer.summary.counts.files > 0)}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 ${c.primary}`}
            >
              Import {count(importer.summary.counts.importing)} {importer.summary.counts.importing === 1 ? 'note' : 'notes'}
            </button>
          </div>
        )}
        {stage === 'report' && (
          <div className={`px-6 py-4 border-t ${c.divider}`}>
            <button type="button" onClick={importer.close} className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium ${c.secondary}`}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
