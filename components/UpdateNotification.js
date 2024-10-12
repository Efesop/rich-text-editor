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
    if (updateInfo && updateInfo.available) {
      setUpdateStatus(`Update available: ${updateInfo.latestVersion}`);
    } else {
      setUpdateStatus('');
    }
  }, [updateInfo]);

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

  if (!updateInfo || !updateInfo.available) {
    return null;
  }

  const downloadUpdate = async () => {
    setIsDownloading(true);
    setUpdateStatus('Downloading...');
    try {
      await window.electron.invoke('download-update');
      // Assume you have a way to listen to progress updates and setDownloadProgress accordingly
      // Once download is complete, set isDownloaded to true
      setIsDownloaded(true);
      setIsDownloading(false);
      setUpdateStatus('Download complete. Ready to install.');
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
    <div className="fixed bottom-4 right-4 bg-blue-100 p-4 rounded-lg shadow-lg max-w-md z-50">
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium text-blue-600">{updateStatus}</span>
        {!isInstalling && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {isDownloading && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-in-out" 
              style={{width: `${downloadProgress}%`}}
            />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {downloadProgress > 0 ? `${Math.round(downloadProgress)}% complete` : 'Starting download...'}
          </p>
        </div>
      )}
      {updateInfo && updateInfo.available && !isDownloading && !isDownloaded && (
        <Button onClick={downloadUpdate} className="w-full bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Download Update
        </Button>
      )}
      {isDownloaded && !isInstalling && (
        <Button onClick={installUpdate} className="w-full bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Install Update
        </Button>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-4">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
          style={{ width: `${downloadProgress}%` }}
        ></div>
      </div>
    </div>
  );
}
