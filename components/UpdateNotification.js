import React, { useEffect, useState, useCallback } from 'react';
import { Button } from "./ui/button";
import { ArrowDownCircle, X } from 'lucide-react';

export default function UpdateNotification({ onClose }) {
  const [updateStatus, setUpdateStatus] = useState('No updates checked');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const handleCheckingForUpdate = () => {
      console.log('Checking for update...');
      setUpdateStatus('Checking for updates...');
    };

    const handleUpdateAvailable = (info) => {
      console.log('Update available:', info);
      setUpdateStatus(`Update available: ${info.version}`);
      setUpdateAvailable(true);
      storeUpdateAvailability(true);
    };

    const handleUpdateNotAvailable = (info) => {
      console.log('Update not available:', info);
      setUpdateStatus('Your app is up to date');
    };

    const handleUpdateDownloaded = (info) => {
      console.log('Update downloaded:', info);
      setUpdateStatus(`Update ready to install: ${info.version}`);
      setUpdateDownloaded(true);
    };

    const handleError = (err) => {
      console.error('Update error:', err);
      setUpdateStatus(`Update error: ${err}`);
    };

    const handleDownloadProgress = (progressObj) => {
      const percent = progressObj.percent.toFixed(2);
      console.log(`Download progress: ${percent}%`);
      setDownloadProgress(percent);
      setUpdateStatus(`Downloading update... ${percent}%`);
    };

    const handleInstallProgress = (message) => {
      console.log('Install progress:', message);
      setUpdateStatus(`Installing: ${message}`);
    };

    window.electron.on('checking-for-update', handleCheckingForUpdate);
    window.electron.on('update-available', handleUpdateAvailable);
    window.electron.on('update-not-available', handleUpdateNotAvailable);
    window.electron.on('update-downloaded', handleUpdateDownloaded);
    window.electron.on('error', handleError);
    window.electron.on('download-progress', handleDownloadProgress);
    window.electron.on('install-progress', handleInstallProgress);

    return () => {
      window.electron.removeListener('checking-for-update', handleCheckingForUpdate);
      window.electron.removeListener('update-available', handleUpdateAvailable);
      window.electron.removeListener('update-not-available', handleUpdateNotAvailable);
      window.electron.removeListener('update-downloaded', handleUpdateDownloaded);
      window.electron.removeListener('error', handleError);
      window.electron.removeListener('download-progress', handleDownloadProgress);
      window.electron.removeListener('install-progress', handleInstallProgress);
    };
  }, []);

  const checkForUpdates = async () => {
    try {
      setUpdateStatus('Checking for updates...');
      const result = await window.electron.invoke('check-for-updates');
      if (result.available) {
        setUpdateStatus('Update available. Click to download.');
        setUpdateAvailable(true);
      } else {
        setUpdateStatus('Your app is up to date.');
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      setUpdateStatus('Error checking for updates.');
    }
  };

  const downloadUpdate = async () => {
    try {
      setUpdateStatus('Downloading update...');
      const result = await window.electron.invoke('download-update');
      if (result.success) {
        setUpdateStatus('Update downloaded. Ready to install.');
        setUpdateDownloaded(true);
      } else {
        setUpdateStatus('Error downloading update.');
      }
    } catch (error) {
      console.error('Error downloading update:', error);
      setUpdateStatus('Error downloading update.');
    }
  };

  const installUpdate = async () => {
    console.log('Installing update...');
    setIsInstalling(true);
    setUpdateStatus('Preparing to install...');
    try {
      await window.electron.invoke('install-update');
    } catch (error) {
      console.error('Error installing update:', error);
      setUpdateStatus(`Error installing update: ${error}`);
      setIsInstalling(false);
    }
  };

  const storeUpdateAvailability = async (available) => {
    try {
      await window.electron.invoke('store-update-availability', available);
    } catch (error) {
      console.error('Error storing update availability:', error);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 bg-opacity-90 rounded-lg shadow-lg overflow-hidden max-w-md z-50">
      <div className="px-4 py-3 flex items-center justify-between space-x-4">
        <div className="flex items-center flex-shrink-0">
          <ArrowDownCircle className="h-5 w-5 text-blue-500 mr-2" />
          <span className="text-sm font-medium text-blue-700 whitespace-nowrap">
            {updateStatus}
          </span>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          {!updateAvailable && !updateDownloaded && !isInstalling && (
            <Button
              onClick={checkForUpdates}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded whitespace-nowrap z-50"
              disabled={updateStatus === 'Checking for updates...'}
            >
              Check for updates
            </Button>
          )}
          {updateAvailable && !updateDownloaded && !isInstalling && (
            <Button
              onClick={downloadUpdate}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded whitespace-nowrap z-50"
              disabled={updateStatus.startsWith('Downloading update...')}
            >
              Download update
            </Button>
          )}
          {updateDownloaded && !isInstalling && (
            <Button
              onClick={installUpdate}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded whitespace-nowrap z-50"
            >
              Install update
            </Button>
          )}
          {!isInstalling && (
            <button
              onClick={onClose}
              className="text-blue-500 hover:text-blue-700 focus:outline-none p-1 z-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {(updateStatus.startsWith('Downloading update...') || isInstalling) && (
        <div className="w-full bg-blue-200 h-1">
          <div 
            className="bg-blue-600 h-1" 
            style={{width: isInstalling ? '100%' : `${downloadProgress}%`}}
          ></div>
        </div>
      )}
    </div>
  );
}