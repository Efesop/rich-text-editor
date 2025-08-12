import { useState, useEffect, useCallback, useRef } from 'react';

export function useUpdateManager() {
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [lastCheckTime, setLastCheckTime] = useState(null);
  
  // Ref to track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Safety check - ensure electron is available
    if (!window.electron) {
      console.warn('Electron not available, skipping update manager initialization');
      return;
    }

    // Set up event listeners
    const handleUpdateAvailable = (info) => {
      if (!isMountedRef.current) return;
      setUpdateInfo(info);
      setShowUpdateNotification(true);
      setError(null);
    };

    const handleUpdateNotAvailable = (info) => {
      if (!isMountedRef.current) return;
      setUpdateInfo(info);
      setError(null);
      // Don't show notification for "no update available"
    };

    const handleUpdateError = (errorInfo) => {
      if (!isMountedRef.current) return;
      setError(errorInfo);
      setIsCheckingForUpdates(false);
      setIsDownloading(false);
    };

    const handleCheckingForUpdate = () => {
      if (!isMountedRef.current) return;
      setIsCheckingForUpdates(true);
      setError(null);
    };

    const handleDownloadProgress = (progress) => {
      if (!isMountedRef.current) return;
      setDownloadProgress(progress.percent);
      setIsDownloading(true);
    };

    const handleUpdateDownloaded = () => {
      if (!isMountedRef.current) return;
      setIsDownloading(false);
      setDownloadProgress(100);
      setUpdateInfo(prev => prev ? { ...prev, downloaded: true } : null);
    };

    // Register event listeners
    window.electron.on('update-available', handleUpdateAvailable);
    window.electron.on('update-not-available', handleUpdateNotAvailable);
    window.electron.on('update-error', handleUpdateError);
    window.electron.on('checking-for-update', handleCheckingForUpdate);
    window.electron.on('download-progress', handleDownloadProgress);
    window.electron.on('update-downloaded', handleUpdateDownloaded);

    // Load initial update status
    loadUpdateStatus();

    // Cleanup function
    return () => {
      isMountedRef.current = false;
      window.electron.removeListener('update-available', handleUpdateAvailable);
      window.electron.removeListener('update-not-available', handleUpdateNotAvailable);
      window.electron.removeListener('update-error', handleUpdateError);
      window.electron.removeListener('checking-for-update', handleCheckingForUpdate);
      window.electron.removeListener('download-progress', handleDownloadProgress);
      window.electron.removeListener('update-downloaded', handleUpdateDownloaded);
    };
  }, []);

  const loadUpdateStatus = useCallback(async () => {
    if (!window.electron) return;
    
    try {
      const status = await window.electron.invoke('get-update-status');
      if (isMountedRef.current && status) {
        setIsCheckingForUpdates(status.isCheckingForUpdates);
        setIsDownloading(status.isDownloading);
        setIsInstalling(status.isInstalling);
        setUpdateInfo(status.updateInfo);
        setLastCheckTime(status.lastUpdateCheck);
      }
    } catch (error) {
      console.error('Error loading update status:', error);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!window.electron || isCheckingForUpdates) return;
    
    setIsCheckingForUpdates(true);
    setError(null);
    
    try {
      const result = await window.electron.invoke('check-for-updates');
      
      if (result.inProgress) {
        // Check is already in progress
        return;
      }
      
      if (result.error && !result.isDevelopment) {
        setError({
          message: result.error,
          offline: result.offline || false,
          canRetry: result.canRetry || false,
          rateLimited: result.rateLimited || false,
          waitTime: result.waitTime || null
        });
        
        // Only show notifications for actual errors (offline, rate limited, etc.)
        if (result.offline || result.rateLimited) {
          setShowUpdateNotification(true);
        }
      } else {
        setUpdateInfo(result);
        if (result.available) {
          setShowUpdateNotification(true);
        }
      }
      
      setLastCheckTime(new Date().toISOString());
    } catch (error) {
      console.error('Error checking for updates:', error);
      setError({
        message: error.message,
        canRetry: true
      });
    } finally {
      setIsCheckingForUpdates(false);
    }
  }, [isCheckingForUpdates]);

  const downloadUpdate = useCallback(async () => {
    if (!window.electron || isDownloading || !updateInfo?.available) return;
    
    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);
    
    try {
      const result = await window.electron.invoke('download-update');
      
      if (result.inProgress) {
        // Download already in progress
        return;
      }
      
      if (!result.success) {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('Error downloading update:', error);
      setError({
        message: `Download failed: ${error.message}`,
        canRetry: true
      });
      setIsDownloading(false);
    }
  }, [isDownloading, updateInfo]);

  const installUpdate = useCallback(async () => {
    if (!window.electron || isInstalling) return;
    
    setIsInstalling(true);
    setError(null);
    
    try {
      await window.electron.invoke('install-update');
      // App will quit and restart, so we don't need to handle the response
    } catch (error) {
      console.error('Error installing update:', error);
      setError({
        message: `Installation failed: ${error.message}`,
        canRetry: true
      });
      setIsInstalling(false);
    }
  }, [isInstalling]);

  const handleBellClick = useCallback(async () => {
    await checkForUpdates();
  }, [checkForUpdates]);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  const canCheckForUpdates = !isCheckingForUpdates && !isDownloading && !isInstalling;

  return {
    // State
    showUpdateNotification,
    setShowUpdateNotification,
    updateInfo,
    isCheckingForUpdates,
    isDownloading,
    isInstalling,
    downloadProgress,
    error,
    lastCheckTime,
    
    // Computed
    canCheckForUpdates,
    
    // Actions
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    handleBellClick,
    dismissError,
    loadUpdateStatus
  };
}

