import React, { useEffect, useState } from 'react';
import { Button } from "./ui/button";

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  useEffect(() => {
    window.electron.on('update-available', () => {
      setUpdateAvailable(true);
    });

    window.electron.on('update-downloaded', () => {
      setUpdateDownloaded(true);
    });
  }, []);

  const handleRestart = () => {
    window.electron.invoke('restart-app');
  };

  if (updateDownloaded) {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-500 text-white p-4 rounded-lg shadow-lg">
        <p>Update downloaded. Restart to install?</p>
        <Button onClick={handleRestart}>Restart</Button>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-500 text-white p-4 rounded-lg shadow-lg">
        <p>Update available. Downloading...</p>
      </div>
    );
  }

  return null;
}