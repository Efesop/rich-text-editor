import React, { useEffect, useState } from 'react';
import { Button } from "./ui/button";
import { ArrowDownCircle, X } from 'lucide-react';

export default function UpdateNotification() {
  const [updateStatus, setUpdateStatus] = useState('No updates checked');
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    window.electron.on('update-available', (info) => {
      setUpdateStatus('Update available. Downloading...');
      setIsVisible(true);
    });

    window.electron.on('update-not-available', (info) => {
      setUpdateStatus('Your app is up to date');
      setIsVisible(true);
    });

    window.electron.on('update-downloaded', (info) => {
      setUpdateStatus('Update ready to install');
      setUpdateDownloaded(true);
      setIsVisible(true);
    });

    window.electron.on('error', (error) => {
      setUpdateStatus('Update error. Try again later.');
      setIsVisible(true);
    });

    return () => {
      // Clean up listeners
      window.electron.removeAllListeners('update-available');
      window.electron.removeAllListeners('update-not-available');
      window.electron.removeAllListeners('update-downloaded');
      window.electron.removeAllListeners('error');
    };
  }, []);

  const checkForUpdates = () => {
    setUpdateStatus('Checking for updates...');
    window.electron.invoke('check-for-updates');
  };

  const installUpdate = () => {
    window.electron.invoke('install-update');
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-100 bg-opacity-90 rounded shadow-lg overflow-hidden">
      <div className="px-4 py-2 flex items-center justify-between space-x-4">
        <div className="flex items-center">
          <ArrowDownCircle className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
          <span className="text-xs font-medium text-blue-700 truncate max-w-[150px]">
            {updateStatus}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            onClick={updateDownloaded ? installUpdate : checkForUpdates}
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded"
          >
            {updateDownloaded ? 'Install' : 'Check for updates'}
          </Button>
          <button
            onClick={() => setIsVisible(false)}
            className="text-blue-500 hover:text-blue-700 focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}