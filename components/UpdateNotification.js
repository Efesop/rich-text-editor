import React, { useEffect, useState } from 'react';
import { Button } from "./ui/button";
import { ArrowDownCircle, X, AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';

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
  const [showDetails, setShowDetails] = useState(false);

  // Don't render if no update info and no error
  if (!updateInfo && !error && !isChecking) {
    return null;
  }

  const renderContent = () => {
    // Error state
    if (error) {
      // Don't show notification for development mode
      if (error.isDevelopment) {
        return null;
      }
      
      return (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            {error.offline ? (
              <WifiOff className="h-5 w-5 text-orange-500" />
            ) : error.rateLimited ? (
              <RefreshCw className="h-5 w-5 text-blue-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
            <span className="font-medium text-red-600 dark:text-red-400">
              {error.offline ? 'Offline' : error.rateLimited ? 'Rate Limited' : 'Update Error'}
            </span>
          </div>
          
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {error.message}
          </p>
          
          {error.canRetry && onRetry && (
            <Button 
              onClick={onRetry} 
              size="sm" 
              variant="outline"
              className="w-full"
              disabled={error.rateLimited}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {error.rateLimited ? `Wait ${error.waitTime || 30}s` : 'Try Again'}
            </Button>
          )}
        </div>
      );
    }

    // Checking state
    if (isChecking) {
      return (
        <div className="flex items-center space-x-3">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
          <span className="font-medium text-blue-600 dark:text-blue-400">
            Checking for updates...
          </span>
        </div>
      );
    }

    // Installing state
    if (isInstalling) {
      return (
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <RefreshCw className="h-5 w-5 animate-spin text-green-500" />
            <span className="font-medium text-green-600 dark:text-green-400">
              Installing update...
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The app will restart automatically when installation is complete.
          </p>
        </div>
      );
    }

    // Update available
    if (updateInfo?.available) {
      const isDownloaded = updateInfo.downloaded;
      
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-blue-600 dark:text-blue-400">
                Update Available
              </span>
              {updateInfo.latestVersion && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Version {updateInfo.latestVersion}
                </p>
              )}
            </div>
            
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {showDetails ? 'Less' : 'Details'}
            </button>
          </div>

          {showDetails && updateInfo.releaseNotes && (
            <div className="text-xs text-gray-600 dark:text-gray-400 max-h-20 overflow-y-auto">
              {updateInfo.releaseNotes}
            </div>
          )}

          {isDownloading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Downloading...</span>
                <span>{Math.round(downloadProgress)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-in-out" 
                  style={{width: `${downloadProgress}%`}}
                />
              </div>
            </div>
          )}

          {!isDownloading && !isDownloaded && onDownload && (
            <Button 
              onClick={onDownload} 
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
              size="sm"
            >
              <ArrowDownCircle className="h-4 w-4 mr-2" />
              Download Update
            </Button>
          )}

          {isDownloaded && onInstall && (
            <Button 
              onClick={onInstall} 
              className="w-full bg-green-600 text-white hover:bg-green-700"
              size="sm"
            >
              Install & Restart
            </Button>
          )}
        </div>
      );
    }

    // No update available (only show if explicitly checked)
    if (updateInfo && !updateInfo.available) {
      return (
        <div className="flex items-center space-x-2">
          <div className="h-2 w-2 bg-green-500 rounded-full"></div>
          <span className="font-medium text-green-600 dark:text-green-400">
            You're up to date!
          </span>
          {updateInfo.currentVersion && (
            <span className="text-sm text-gray-500">
              (v{updateInfo.currentVersion})
            </span>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-lg max-w-sm z-50">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          {renderContent()}
        </div>
        
        {onClose && !isInstalling && (
          <button 
            onClick={onClose} 
            className="ml-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
