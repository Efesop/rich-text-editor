import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from "./ui/button";
import { ArrowDownCircle, X, AlertTriangle, RefreshCw, Wifi, WifiOff, Download, CheckCircle } from 'lucide-react';

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

  const getNotificationStyles = () => {
    if (theme === 'fallout') {
      return {
        container: 'fixed bottom-4 right-4 max-w-sm bg-gray-900 border-2 border-green-600 rounded-lg shadow-2xl shadow-green-600/20 z-50',
        text: 'text-green-400 font-mono',
        subtext: 'text-green-300 font-mono',
        progress: 'bg-green-600',
        progressBg: 'bg-gray-800'
      }
    } else if (theme === 'dark') {
      return {
        container: 'fixed bottom-4 right-4 max-w-sm bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50',
        text: 'text-white',
        subtext: 'text-gray-300',
        progress: 'bg-blue-600',
        progressBg: 'bg-gray-700'
      }
    }
    return {
      container: 'fixed bottom-4 right-4 max-w-sm bg-white border border-gray-200 rounded-lg shadow-2xl z-50',
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
            <div className={`text-xs ${styles.subtext} truncate`}>
              {error.message}
            </div>
          </div>
          
          {error.canRetry && onRetry && (
            <Button 
              onClick={onRetry} 
              size="sm" 
              variant="ghost"
              className={`px-3 py-1 text-xs ${theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : ''}`}
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
          <RefreshCw className={`h-5 w-5 animate-spin ${theme === 'fallout' ? 'text-green-400' : 'text-green-500'} flex-shrink-0`} />
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
            <Download className={`h-5 w-5 ${theme === 'fallout' ? 'text-green-400' : 'text-blue-500'} flex-shrink-0`} />
            
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
          <CheckCircle className={`h-5 w-5 ${theme === 'fallout' ? 'text-green-400' : 'text-green-500'} flex-shrink-0`} />
          <div className="flex-1">
            <div className={`font-medium ${styles.text} text-sm`}>
              You're up to date!
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

  return (
    <div className={styles.container}>
      <div className="flex items-stretch">
        <div className="flex-1">
          {renderContent()}
        </div>
        
        {onClose && !isInstalling && (
          <button 
            onClick={onClose} 
            className={`p-4 ${theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : theme === 'dark' ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'} transition-colors flex-shrink-0`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
