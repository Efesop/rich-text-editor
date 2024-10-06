import React, { useEffect, useState, useCallback } from 'react';
import { Button } from "./ui/button";
import { ArrowDownCircle, X } from 'lucide-react';

export default function UpdateNotification({ onClose }) {
  const [updateStatus, setUpdateStatus] = useState('No updates checked');
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const handleUpdateAvailable = useCallback(() => {
    console.log('Update available');
    setUpdateStatus('Update available. Downloading...');
  }, []);

  const handleUpdateNotAvailable = useCallback(() => {
    console.log('No update available');
    setUpdateStatus('Your app is up to date');
  }, []);

  const handleUpdateDownloaded = useCallback(() => {
    console.log('Update downloaded');
    setUpdateStatus('Update ready to install');
    setUpdateDownloaded(true);
  }, []);

  const handleError = useCallback((err) => {
    console.error('Update error:', err);
    setUpdateStatus(`Update error: ${err}`);
  }, []);

  const handleDownloadProgress = useCallback((progressObj) => {
    const percent = progressObj.percent.toFixed(2);
    console.log(`Download progress: ${percent}%`);
    setDownloadProgress(percent);
    setUpdateStatus(`Downloading update... ${percent}%`);
  }, []);

  useEffect(() => {
    window.electron.on('update-available', handleUpdateAvailable);
    window.electron.on('update-not-available', handleUpdateNotAvailable);
    window.electron.on('update-downloaded', handleUpdateDownloaded);
    window.electron.on('error', handleError);
    window.electron.on('download-progress', handleDownloadProgress);

    return () => {
      window.electron.removeListener('update-available', handleUpdateAvailable);
      window.electron.removeListener('update-not-available', handleUpdateNotAvailable);
      window.electron.removeListener('update-downloaded', handleUpdateDownloaded);
      window.electron.removeListener('error', handleError);
      window.electron.removeListener('download-progress', handleDownloadProgress);
    };
  }, [handleUpdateAvailable, handleUpdateNotAvailable, handleUpdateDownloaded, handleError, handleDownloadProgress]);

  const checkForUpdates = () => {
    console.log('Checking for updates...');
    setUpdateStatus('Checking for updates...');
    window.electron.invoke('check-for-updates');
  };

  const installUpdate = () => {
    console.log('Installing update...');
    window.electron.invoke('install-update');
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
          <Button
            onClick={updateDownloaded ? installUpdate : checkForUpdates}
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded whitespace-nowrap z-50"
            disabled={updateStatus.startsWith('Downloading update...')}
          >
            {updateDownloaded ? 'Install' : 'Check for updates'}
          </Button>
          <button
            onClick={onClose}
            className="text-blue-500 hover:text-blue-700 focus:outline-none p-1 z-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {updateStatus.startsWith('Downloading... (it will speed up)') && (
        <div className="w-full bg-blue-200 h-1">
          <div 
            className="bg-blue-600 h-1" 
            style={{width: `${downloadProgress}%`}}
          ></div>
        </div>
      )}
    </div>
  );
}