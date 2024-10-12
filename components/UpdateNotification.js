import React, { useEffect, useState } from 'react';
import { Button } from "./ui/button";
import { ArrowDownCircle, X } from 'lucide-react';

export default function UpdateNotification({ onClose, updateInfo, isChecking }) {
  const [updateStatus, setUpdateStatus] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);

  useEffect(() => {
    if (isChecking) {
      setUpdateStatus('Checking for updates...');
    } else if (updateInfo && updateInfo.available) {
      setUpdateStatus(`Update available: ${updateInfo.latestVersion}`);
    } else if (updateInfo && !updateInfo.available) {
      setUpdateStatus('Your app is up to date.');
    }
  }, [updateInfo, isChecking]);

  useEffect(() => {
    const handleDownloadProgress = ({ percent }) => {
      setDownloadProgress(percent);
      setUpdateStatus(`Downloading update... ${percent.toFixed(2)}%`);
    };

    const handleInstallProgress = (message) => {
      setUpdateStatus(`Installing: ${message}`);
    };

    const handleUpdateDownloaded = () => {
      setIsDownloaded(true);
      setUpdateStatus('Update downloaded. Ready to install.');
    };

    window.electron.on('download-progress', handleDownloadProgress);
    window.electron.on('install-progress', handleInstallProgress);
    window.electron.on('update-downloaded', handleUpdateDownloaded);

    return () => {
      window.electron.removeListener('download-progress', handleDownloadProgress);
      window.electron.removeListener('install-progress', handleInstallProgress);
      window.electron.removeListener('update-downloaded', handleUpdateDownloaded);
    };
  }, []);

  const downloadUpdate = async () => {
    try {
      setUpdateStatus('Downloading update...');
      const result = await window.electron.invoke('download-update');
      if (result.success) {
        setIsDownloaded(true);
        setUpdateStatus('Update downloaded. Ready to install.');
      } else {
        setUpdateStatus('Error downloading update.');
      }
    } catch (error) {
      console.error('Error downloading update:', error);
      setUpdateStatus('Error downloading update.');
    }
  };

  const installUpdate = async () => {
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

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 bg-opacity-90 rounded-lg shadow-lg overflow-hidden max-w-md z-50">
      <div className="px-4 py-3 flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-700 whitespace-nowrap">
            {updateStatus}
          </span>
          {!isInstalling && (
            <button
              onClick={onClose}
              className="text-blue-500 hover:text-blue-700 focus:outline-none p-1 z-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {downloadProgress > 0 && downloadProgress < 100 && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{width: `${downloadProgress}%`}}
            />
          </div>
        )}
        <div className="flex justify-end space-x-2">
          {updateInfo && updateInfo.available && !isInstalling && !isDownloaded && (
            <Button
              onClick={downloadUpdate}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded whitespace-nowrap z-50"
              disabled={updateStatus.startsWith('Downloading update...')}
            >
              Download update
            </Button>
          )}
          {isDownloaded && !isInstalling && (
            <Button
              onClick={installUpdate}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded whitespace-nowrap z-50"
            >
              Install update
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
