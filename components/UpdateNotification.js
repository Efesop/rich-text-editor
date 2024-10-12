import React, { useEffect, useState } from 'react';
import { Button } from "./ui/button";
import { ArrowDownCircle, X } from 'lucide-react';

export default function UpdateNotification({ onClose, updateInfo, isChecking }) {
  const [updateStatus, setUpdateStatus] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

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

    const handleUpdateDownloaded = () => {
      setIsDownloaded(true);
      setIsDownloading(false);
      setUpdateStatus('Update downloaded. Ready to install.');
    };

    window.electron.on('download-progress', handleDownloadProgress);
    window.electron.on('update-downloaded', handleUpdateDownloaded);

    return () => {
      window.electron.removeListener('download-progress', handleDownloadProgress);
      window.electron.removeListener('update-downloaded', handleUpdateDownloaded);
    };
  }, []);

  const downloadUpdate = async () => {
    setIsDownloading(true);
    setUpdateStatus('Starting download...');
    try {
      await window.electron.invoke('download-update');
    } catch (error) {
      console.error('Error downloading update:', error);
      setUpdateStatus('Error downloading update.');
      setIsDownloading(false);
    }
  };

  const installUpdate = async () => {
    setIsInstalling(true);
    setUpdateStatus('Installing update...');
    try {
      await window.electron.invoke('install-update');
    } catch (error) {
      console.error('Error installing update:', error);
      setUpdateStatus('Error installing update.');
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 p-4 rounded-lg shadow-lg max-w-md">
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium">{updateStatus}</span>
        {!isInstalling && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {isDownloading && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
          <div 
            className="bg-blue-600 h-2.5 rounded-full" 
            style={{width: `${downloadProgress}%`}}
          />
        </div>
      )}
      {updateInfo && updateInfo.available && !isDownloading && !isDownloaded && (
        <Button onClick={downloadUpdate} className="w-full">
          Download Update
        </Button>
      )}
      {isDownloaded && !isInstalling && (
        <Button onClick={installUpdate} className="w-full">
          Install Update
        </Button>
      )}
    </div>
  );
}