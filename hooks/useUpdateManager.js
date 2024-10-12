import { useState, useEffect, useCallback } from 'react';

export function useUpdateManager() {
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);

  useEffect(() => {
    const handleUpdateAvailable = (info) => {
      setUpdateInfo(info);
      setShowUpdateNotification(true);
    };

    window.electron.on('update-available', handleUpdateAvailable);

    return () => {
      window.electron.removeListener('update-available', handleUpdateAvailable);
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    try {
      const result = await window.electron.invoke('manual-check-for-updates');
      setUpdateInfo(result);
      setShowUpdateNotification(true);
    } catch (error) {
      console.error('Error checking for updates:', error);
      setUpdateInfo({ available: false, error: error.message });
    }
  }, []);

  const handleBellClick = useCallback(async () => {
    setIsCheckingForUpdates(true);
    try {
      const result = await window.electron.invoke('manual-check-for-updates');
      setUpdateInfo(result);
      setShowUpdateNotification(true);
    } catch (error) {
      console.error('Error checking for updates:', error);
    } finally {
      setIsCheckingForUpdates(false);
    }
  }, []);

  return {
    showUpdateNotification,
    setShowUpdateNotification,
    updateInfo,
    isCheckingForUpdates,
    checkForUpdates,
    handleBellClick
  };
}

