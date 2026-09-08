import React from 'react';
import { useTheme } from 'next-themes';
import { Button } from "./ui/button";
import { X, AlertTriangle, RefreshCw, WifiOff, Download, CheckCircle, Check } from 'lucide-react';

const RELEASES_URL = 'https://github.com/Efesop/rich-text-editor/releases'

export default function UpdateNotification({
  onClose,
  updateInfo,
  isChecking,
  error,
  downloadProgress,
  isDownloading,
  isInstalling,
  onDownload,
  onInstall,
  onRetry
}) {
  const { theme } = useTheme();

  // Don't render if no update info and no error
  if (!updateInfo && !error && !isChecking) {
    return null;
  }

  // Check if this is a critical error that needs more prominent display
  const isCriticalError = error && (
    error.message?.includes('read-only') ||
    error.message?.includes('Applications folder')
  )

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const getNotificationStyles = () => {
    // Critical errors get centered modal treatment
    if (isCriticalError) {
      if (theme === 'fallout') {
        return {
          container: 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60',
          inner: 'w-full max-w-md bg-gray-900 border-2 border-green-600 rounded-2xl shadow-2xl shadow-green-600/20',
          text: 'text-green-400 font-mono',
          subtext: 'text-green-300 font-mono',
          progress: 'bg-green-600',
          progressBg: 'bg-gray-800'
        }
      } else if (theme === 'darkblue') {
        return {
          container: 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60',
          inner: 'w-full max-w-md rounded-2xl shadow-2xl border border-[#1c2438] bg-[#141825]',
          text: 'text-[#e0e6f0]',
          subtext: 'text-[#8b99b5]',
          progress: 'bg-blue-600',
          progressBg: 'bg-[#1a2035]'
        }
      } else if (theme === 'dark') {
        return {
          container: 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60',
          inner: 'w-full max-w-md bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl shadow-2xl',
          text: 'text-white',
          subtext: 'text-[#c0c0c0]',
          progress: 'bg-blue-600',
          progressBg: 'bg-[#2f2f2f]'
        }
      }
      return {
        container: 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60',
        inner: 'w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-2xl',
        text: 'text-gray-900',
        subtext: 'text-gray-600',
        progress: 'bg-blue-600',
        progressBg: 'bg-gray-200'
      }
    }

    // Regular notifications: a 320px card in the bottom-right corner, drawn
    // with the theme's surface / border / accent so it looks native in all
    // four themes (Sep 2026 UI refresh).
    if (theme === 'fallout') {
      return {
        container: 'fixed bottom-12 right-4 w-[320px] bg-gray-900 border border-green-600/40 rounded-2xl shadow-2xl shadow-green-600/10 z-50',
        inner: '',
        text: 'text-green-400 font-mono',
        subtext: 'text-green-600 font-mono',
        link: 'text-green-400',
        progress: 'bg-green-500',
        progressBg: 'bg-gray-800',
        primary: 'bg-green-500 text-gray-900 hover:bg-green-400 font-mono',
        ghost: 'text-green-600 hover:text-green-400 hover:bg-gray-800 font-mono',
        close: 'text-green-700 hover:text-green-400 hover:bg-gray-800'
      }
    } else if (theme === 'darkblue') {
      return {
        container: 'fixed bottom-12 right-4 w-[320px] rounded-2xl shadow-2xl shadow-black/50 z-50 border border-[#1c2438] bg-[#1a2035]',
        inner: '',
        text: 'text-[#e0e6f0]',
        subtext: 'text-[#5d6b88]',
        link: 'text-blue-400',
        progress: 'bg-blue-500',
        progressBg: 'bg-[#232b42]',
        primary: 'bg-blue-500 text-white hover:bg-blue-400',
        ghost: 'text-[#5d6b88] hover:text-[#8b99b5] hover:bg-[#232b42]',
        close: 'text-[#445068] hover:text-[#8b99b5] hover:bg-[#232b42]'
      }
    } else if (theme === 'dark') {
      return {
        container: 'fixed bottom-12 right-4 w-[320px] bg-[#2f2f2f] border border-[#3a3a3a] rounded-2xl shadow-2xl shadow-black/50 z-50',
        inner: '',
        text: 'text-[#ececec]',
        subtext: 'text-[#8e8e8e]',
        link: 'text-blue-400',
        progress: 'bg-blue-500',
        progressBg: 'bg-[#3a3a3a]',
        primary: 'bg-blue-500 text-white hover:bg-blue-400',
        ghost: 'text-[#8e8e8e] hover:text-[#c0c0c0] hover:bg-[#3a3a3a]',
        close: 'text-[#6b6b6b] hover:text-[#c0c0c0] hover:bg-[#3a3a3a]'
      }
    }
    return {
      container: 'fixed bottom-12 right-4 w-[320px] bg-white border border-neutral-200 rounded-2xl shadow-xl shadow-neutral-200/60 z-50',
      inner: '',
      text: 'text-neutral-900',
      subtext: 'text-neutral-500',
      link: 'text-blue-600',
      progress: 'bg-blue-500',
      progressBg: 'bg-neutral-200',
      primary: 'bg-blue-500 text-white hover:bg-blue-600',
      ghost: 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100',
      close: 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
    }
  }

  const styles = getNotificationStyles()

  const AppIcon = ({ badge = null }) => (
    <div className="relative flex-shrink-0">
      <img src="./icons/dash-logo.png" alt="" className="h-9 w-9 rounded-[9px]" draggable={false} />
      {badge}
    </div>
  )

  const CloseButton = () => (
    onClose && !isInstalling
      ? (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className={`absolute top-2.5 right-2.5 h-6 w-6 rounded-md flex items-center justify-center transition-colors ${styles.close}`}
        >
          <X className="h-3.5 w-3.5 pointer-events-none" />
        </button>
        )
      : null
  )

  const whatsNewUrl = updateInfo?.latestVersion ? `${RELEASES_URL}/tag/v${updateInfo.latestVersion}` : RELEASES_URL
  const openWhatsNew = () => {
    try { window.open(whatsNewUrl, '_blank', 'noopener,noreferrer') } catch { /* ignore */ }
  }

  const renderContent = () => {
    // Error state
    if (error) {
      // Don't show notification for development mode
      if (error.isDevelopment) {
        return null;
      }

      // Critical error - show as centered modal with full details
      if (isCriticalError) {
        const isReadOnlyError = error.message?.includes('read-only')

        return (
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-full ${
                theme === 'fallout'
                  ? 'bg-red-500/20'
                  : theme === 'darkblue'
                    ? 'bg-red-500/20'
                    : theme === 'dark'
                      ? 'bg-red-500/20'
                      : 'bg-red-100'
              }`}>
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>

              <div className="flex-1">
                <h3 className={`font-semibold text-lg ${styles.text}`}>
                  {isReadOnlyError ? 'Move to Applications Folder' : 'Update Error'}
                </h3>
                <p className={`text-sm ${styles.subtext} mt-2`}>
                  {isReadOnlyError
                    ? 'Dash cannot update because it\'s running from a read-only location (like Downloads or a disk image).'
                    : error.message
                  }
                </p>

                {isReadOnlyError && (
                  <div className={`mt-4 p-3 rounded-lg ${
                    theme === 'fallout'
                      ? 'bg-gray-800 border border-green-600/30'
                      : theme === 'darkblue'
                        ? 'bg-[#1a2035] border border-[#1c2438]'
                        : theme === 'dark'
                          ? 'bg-[#2f2f2f]'
                          : 'bg-gray-100'
                  }`}>
                    <p className={`text-sm font-medium ${styles.text}`}>To fix this:</p>
                    <ol className={`text-sm ${styles.subtext} mt-2 space-y-1 list-decimal list-inside`}>
                      <li>Close Dash</li>
                      <li>Drag Dash to your <strong>Applications</strong> folder</li>
                      <li>Open Dash from Applications</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={onClose}
                className={`px-4 py-2 ${
                  theme === 'fallout'
                    ? 'bg-green-600 text-gray-900 hover:bg-green-500 font-mono'
                    : theme === 'darkblue'
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : theme === 'dark'
                        ? 'bg-[#2f2f2f] hover:bg-[#3a3a3a] text-white'
                        : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                Got it
              </Button>
            </div>
          </div>
        );
      }

      // Download failed while an update is known — keep the update card, show the error inline
      if (updateInfo?.available && error.message && error.message.includes('Download failed')) {
        return (
          <div className="p-3.5">
            <div className="flex items-start gap-3 pr-6">
              <AppIcon />
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold leading-snug ${styles.text}`}>Dash {updateInfo.latestVersion || ''} is available</div>
                <div className="text-xs leading-relaxed mt-0.5 text-red-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  Download failed
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-1.5">
              <button onClick={onClose} className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${styles.ghost}`}>Later</button>
              {error.canRetry && onDownload && (
                <button onClick={onDownload} className={`h-7 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${styles.primary}`}>
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          </div>
        )
      }

      // Regular error - compact notification
      return (
        <div className="flex items-center gap-3 p-4 pr-10">
          {error.offline ? (
            <WifiOff className="h-5 w-5 text-orange-500 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <div className={`font-medium ${styles.text} text-sm`}>
              {error.offline ? 'Offline' : 'Update Error'}
            </div>
            <div className={`text-xs ${styles.subtext}`}>
              {error.message}
            </div>
          </div>

          {error.canRetry && onRetry && (
            <button
              onClick={onRetry}
              className={`h-7 px-2.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${styles.ghost}`}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      );
    }

    // Don't show "checking" state to users - it's unnecessary noise
    // Updates should check silently in background, only notify when actionable
    if (isChecking) {
      return null; // Silent background checking
    }

    // Installing state
    if (isInstalling) {
      return (
        <div className="p-3.5 flex items-center gap-3">
          <AppIcon />
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold leading-snug ${styles.text} flex items-center gap-2`}>
              <RefreshCw className={`h-3.5 w-3.5 animate-spin ${isFallout ? 'text-green-400' : 'text-blue-400'}`} />
              Installing update…
            </div>
            <div className={`text-xs leading-relaxed mt-0.5 ${styles.subtext}`}>Dash will restart in a moment.</div>
          </div>
        </div>
      );
    }

    // Update available — three states: available, downloading, ready
    if (updateInfo?.available) {
      const isDownloaded = updateInfo.downloaded;
      const version = updateInfo.latestVersion || ''

      if (isDownloading) {
        return (
          <div className="p-3.5">
            <div className="flex items-start gap-3">
              <AppIcon />
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold leading-snug ${styles.text}`}>Downloading Dash {version}</div>
                <div className={`text-xs leading-relaxed mt-0.5 ${styles.subtext}`}>You can keep writing. We&apos;ll ask before restarting.</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <div className={`flex-1 h-1 rounded-full overflow-hidden ${styles.progressBg}`}>
                <div
                  className={`${styles.progress} h-full rounded-full transition-all duration-300 ease-in-out`}
                  style={{ width: `${Math.max(0, Math.min(100, downloadProgress || 0))}%` }}
                />
              </div>
              <span className={`text-[11px] tabular-nums ${styles.subtext}`}>{Math.round(downloadProgress || 0)}%</span>
            </div>
          </div>
        )
      }

      if (isDownloaded) {
        return (
          <div className="p-3.5">
            <div className="flex items-start gap-3 pr-6">
              <AppIcon badge={(
                <span className={`absolute -right-1 -bottom-1 h-4 w-4 rounded-full flex items-center justify-center border-2 ${isFallout ? 'bg-green-500 border-gray-900' : isDarkBlue ? 'bg-green-500 border-[#1a2035]' : isDark ? 'bg-green-500 border-[#2f2f2f]' : 'bg-green-500 border-white'}`}>
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                </span>
              )} />
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold leading-snug ${styles.text}`}>Dash {version} is ready to install</div>
                <div className={`text-xs leading-relaxed mt-0.5 ${styles.subtext}`}>Restart takes a few seconds. Your notes are saved.</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-1.5">
              <button onClick={onClose} className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${styles.ghost}`}>On next launch</button>
              {onInstall && (
                <button onClick={onInstall} className={`h-7 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${styles.primary}`}>
                  <RefreshCw className="h-3 w-3" />
                  Restart now
                </button>
              )}
            </div>
          </div>
        )
      }

      return (
        <div className="p-3.5">
          <div className="flex items-start gap-3 pr-6">
            <AppIcon />
            <div className="flex-1 min-w-0">
              <div className={`text-[13px] font-semibold leading-snug ${styles.text}`}>Dash {version} is available</div>
              <div className={`text-xs leading-relaxed mt-0.5 ${styles.subtext}`}>
                {updateInfo.releaseName || 'Improvements and fixes.'}{' '}
                <button onClick={openWhatsNew} className={`${styles.link} hover:underline`}>What&apos;s new</button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <button onClick={onClose} className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${styles.ghost}`}>Later</button>
            {onDownload && (
              <button onClick={onDownload} className={`h-7 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${styles.primary}`}>
                <Download className="h-3 w-3" />
                Download
              </button>
            )}
          </div>
        </div>
      );
    }

    // No update available (only show if explicitly checked)
    if (updateInfo && !updateInfo.available) {
      return (
        <div className="flex items-center gap-3 p-3.5 pr-10">
          <CheckCircle className={`h-5 w-5 ${theme === 'fallout' ? 'text-green-400' : theme === 'darkblue' ? 'text-blue-400' : 'text-green-500'} flex-shrink-0`} />
          <div className="flex-1">
            <div className={`text-[13px] font-semibold ${styles.text}`}>
              You&apos;re up to date
            </div>
            {updateInfo.currentVersion && (
              <div className={`text-xs ${styles.subtext}`}>
                Dash {updateInfo.currentVersion}
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  // Critical errors use modal layout (close button is inside content)
  if (isCriticalError) {
    return (
      <div className={styles.container} onClick={onClose}>
        <div className={styles.inner} onClick={(e) => e.stopPropagation()}>
          {renderContent()}
        </div>
      </div>
    );
  }

  const content = renderContent()
  if (!content) return null

  // Regular notifications use the corner card with an X in the corner.
  // NB: no `relative` here — Tailwind emits it after `fixed`, so it would
  // override the fixed positioning and drop the card into the flex row
  // (full-height panel bug in v1.6.1). `fixed` already anchors the X.
  return (
    <div className={styles.container} role="status" aria-live="polite" style={{ animation: 'dash-dropdown-in 160ms ease-out forwards' }}>
      {content}
      <CloseButton />
    </div>
  );
}
