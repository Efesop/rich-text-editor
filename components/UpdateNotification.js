import React, { useEffect, useState } from 'react';
import { Button } from "./ui/button";

export default function UpdateNotification() {
  const [updateStatus, setUpdateStatus] = useState('No update check performed');

  useEffect(() => {
    window.electron.on('update-available', (info) => {
      console.log('Update available event received:', info);
      setUpdateStatus('Update available. Downloading...');
    });

    window.electron.on('update-not-available', (info) => {
      console.log('Update not available event received:', info);
      setUpdateStatus('No update available');
    });

    window.electron.on('update-downloaded', (info) => {
      console.log('Update downloaded event received:', info);
      setUpdateStatus('Update downloaded. Ready to install.');
    });

    window.electron.on('error', (error) => {
      console.error('Update error:', error);
      setUpdateStatus(`Error checking for update: ${error}`);
    });
  }, []);

  const checkForUpdates = () => {
    console.log('Manually checking for updates...');
    setUpdateStatus('Checking for updates...');
    window.electron.invoke('check-for-updates');
  };

  return (
    <div className="fixed bottom-4 right-4 bg-blue-500 text-white p-4 rounded-lg shadow-lg">
      <p>{updateStatus}</p>
      <Button onClick={checkForUpdates}>Check for Updates</Button>
    </div>
  );
}