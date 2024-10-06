import React, { useEffect, useState, useCallback } from 'react';
import { Button } from "./ui/button";
import { ArrowDownCircle, X } from 'lucide-react';

export default function UpdateNotification({ onClose }) {
  const [updateStatus, setUpdateStatus] = useState('No updates checked');
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  const handleUpdateAvailable = useCallback(() => setUpdateStatus('Update available. Downloading...'), []);
  const handleUpdateNotAvailable = useCallback(() => setUpdateStatus('Your app is up to date'), []);
  const handleUpdateDownloaded = useCallback(() => {
    setUpdateStatus('Update ready to install');
    setUpdateDownloaded(true);
  }, []);
  const handleError = useCallback((err) => setUpdateStatus(`Update error: ${err}`), []);
  const handleDownloadProgress = useCallback((progressObj) => {
    const percent = progressObj.percent.toFixed(2);
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
  }, [handleUpdateAvailable, handleUpdateNotAvailable, handleUpdateDownloaded, handleError]);

  const checkForUpdates = () => {
    setUpdateStatus('Checking for updates...');
    window.electron.invoke('check-for-updates');
  };

  const installUpdate = () => {
    window.electron.invoke('install-update');
  };

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 bg-opacity-90 rounded-lg shadow-lg overflow-hidden max-w-md">
      <div className="px-4 py-3 flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-grow">
            <ArrowDownCircle className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0" />
            <span className="text-sm font-medium text-blue-700">
              {updateStatus}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-blue-500 hover:text-blue-700 focus:outline-none p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {updateStatus.startsWith('Downloading update...') && (
          <div className="w-full bg-blue-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{width: updateStatus.split(' ').pop()}}
            ></div>
          </div>
        )}
        <div className="flex justify-end">
          <Button
            onClick={updateDownloaded ? installUpdate : checkForUpdates}
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded"
            disabled={updateStatus.startsWith('Downloading update...')}
          >
            {updateDownloaded ? 'Install' : 'Check for updates'}
          </Button>
        </div>
      </div>
    </div>
  );
}