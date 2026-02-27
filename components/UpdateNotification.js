import React from 'react';
import { useTheme } from 'next-themes';
import { Button } from "./ui/button";
import { ArrowDownCircle, X, AlertTriangle, RefreshCw, WifiOff, Download, CheckCircle } from 'lucide-react';

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

    // Regular notifications stay in corner
    if (theme === 'fallout') {
      return {
        container: 'fixed bottom-4 right-4 max-w-sm bg-gray-900 border-2 border-green-600 rounded-lg shadow-2xl shadow-green-600/20 z-50',
        inner: '',
        text: 'text-green-400 font-mono',
        subtext: 'text-green-300 font-mono',
        progress: 'bg-green-600',
        progressBg: 'bg-gray-800'
      }
    } else if (theme === 'darkblue') {
      return {
        container: 'fixed bottom-4 right-4 max-w-sm rounded-lg shadow-2xl z-50 border border-[#1c2438] bg-[#141825]',
        inner: '',
        text: 'text-[#e0e6f0]',
        subtext: 'text-[#8b99b5]',
        progress: 'bg-blue-600',
        progressBg: 'bg-[#1a2035]'
      }
    } else if (theme === 'dark') {
      return {
        container: 'fixed bottom-4 right-4 max-w-sm bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg shadow-2xl z-50',
        inner: '',
        text: 'text-white',
        subtext: 'text-[#c0c0c0]',
        progress: 'bg-blue-600',
        progressBg: 'bg-[#2f2f2f]'
      }
    }
    return {
      container: 'fixed bottom-4 right-4 max-w-sm bg-white border border-gray-200 rounded-lg shadow-2xl z-50',
      inner: '',
      text: 'text-gray-900',
      subtext: 'text-gray-600',
      progress: 'bg-blue-600',
      progressBg: 'bg-gray-200'
    }
  }

  const styles = getNotificationStyles()

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

      // Regular error - compact notification
      return (
        <div className="flex items-center gap-3 p-4">
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
            <Button
              onClick={onRetry}
              size="sm"
              variant="ghost"
              className={`px-3 py-1 text-xs ${theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : theme === 'darkblue' ? 'text-blue-400 hover:bg-blue-600/20' : ''}`}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </div>
      );
    }

    // Don't show "checking" state to users - it's unnecessary noise
    // Updates should check silently in background, only notify when actionable
    if (isChecking) {
      return null; // Silent background checking
    }

    // Installing state - compact design
    if (isInstalling) {
      return (
        <div className="flex items-center gap-3 p-4">
          <RefreshCw className={`h-5 w-5 animate-spin ${theme === 'fallout' ? 'text-green-400' : theme === 'darkblue' ? 'text-blue-400' : 'text-green-500'} flex-shrink-0`} />
          <div className="flex-1">
            <div className={`font-medium ${styles.text} text-sm`}>
              Installing update...
            </div>
            <div className={`text-xs ${styles.subtext}`}>
              App will restart automatically
            </div>
          </div>
        </div>
      );
    }

    // Update available - sleek compact design
    if (updateInfo?.available) {
      const isDownloaded = updateInfo.downloaded;
      
      return (
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Download className={`h-5 w-5 ${theme === 'fallout' ? 'text-green-400' : theme === 'darkblue' ? 'text-blue-400' : 'text-blue-500'} flex-shrink-0`} />
            
            <div className="flex-1 min-w-0">
              <div className={`font-medium ${styles.text} text-sm`}>
                Update Available
              </div>
              {updateInfo.latestVersion && (
                <div className={`text-xs ${styles.subtext}`}>
                  Version {updateInfo.latestVersion}
                </div>
              )}
            </div>

            {!isDownloading && !isDownloaded && onDownload && (
              <Button 
                onClick={onDownload} 
                size="sm"
                className={`px-3 py-1 text-xs ${
                  theme === 'fallout'
                    ? 'bg-green-600 text-gray-900 hover:bg-green-500 font-mono'
                    : theme === 'darkblue'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : theme === 'dark'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-blue-500 hover:bg-blue-600'
                } text-white`}
              >
                <ArrowDownCircle className="h-3 w-3 mr-1" />
                Download
              </Button>
            )}

            {isDownloaded && onInstall && (
              <Button 
                onClick={onInstall} 
                size="sm"
                className={`px-3 py-1 text-xs ${
                  theme === 'fallout'
                    ? 'bg-green-600 text-gray-900 hover:bg-green-500 font-mono'
                    : 'bg-green-600 hover:bg-green-500'
                } text-white`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Install
              </Button>
            )}
          </div>

          {/* Compact progress bar for downloading */}
          {isDownloading && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className={styles.subtext}>Downloading...</span>
                <span className={styles.subtext}>{Math.round(downloadProgress)}%</span>
              </div>
              <div className={`w-full ${styles.progressBg} rounded-full h-1.5 overflow-hidden`}>
                <div 
                  className={`${styles.progress} h-full rounded-full transition-all duration-300 ease-in-out`}
                  style={{width: `${downloadProgress}%`}}
                />
              </div>
            </div>
          )}

          {/* Compact download error */}
          {error && error.message && error.message.includes('Download failed') && (
            <div className="mt-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <div className="flex-1 text-xs text-red-500 truncate">
                Download failed
              </div>
              {error.canRetry && onDownload && (
                <Button 
                  onClick={onDownload} 
                  variant="ghost"
                  size="sm"
                  className="px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      );
    }

    // No update available (only show if explicitly checked)
    if (updateInfo && !updateInfo.available) {
      return (
        <div className="flex items-center gap-3 p-4">
          <CheckCircle className={`h-5 w-5 ${theme === 'fallout' ? 'text-green-400' : theme === 'darkblue' ? 'text-blue-400' : 'text-green-500'} flex-shrink-0`} />
          <div className="flex-1">
            <div className={`font-medium ${styles.text} text-sm`}>
              You&apos;re up to date!
            </div>
            {updateInfo.currentVersion && (
              <div className={`text-xs ${styles.subtext}`}>
                Version {updateInfo.currentVersion}
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

  // Regular notifications use corner layout with X button
  return (
    <div className={styles.container}>
      <div className="flex items-stretch">
        <div className="flex-1">
          {renderContent()}
        </div>

        {onClose && !isInstalling && (
          <button
            onClick={onClose}
            className={`p-4 ${theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : theme === 'darkblue' ? 'text-[#8b99b5] hover:bg-[#232b42]' : theme === 'dark' ? 'text-[#8e8e8e] hover:bg-[#3a3a3a]' : 'text-gray-500 hover:bg-gray-100'} transition-colors flex-shrink-0`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
