import React, { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/button'
import QRCode from 'qrcode'

export function InstallOnMobileModal ({ isOpen, onClose, pwaUrl }) {
  if (!isOpen) return null

  // PWA URL - GitHub Pages for privacy (no tracking, just static files)
  const url = pwaUrl || (typeof window !== 'undefined' && !window.location.origin.startsWith('file://') 
    ? window.location.origin 
    : 'https://efesop.github.io/rich-text-editor') // GitHub Pages URL
  const [qr, setQr] = useState('')

  useEffect(() => {
    let mounted = true
    const gen = async () => {
      try {
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, scale: 4 })
        if (mounted) setQr(dataUrl)
      } catch (e) {
        // ignore
      }
    }
    gen()
    return () => { mounted = false }
  }, [url])

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='w-full max-w-md rounded-lg border bg-white p-4 dark:bg-gray-900 dark:text-white'>
        <h2 className='text-lg font-semibold mb-2'>Use on your phone</h2>
        <p className='text-sm mb-4'>
          1) On your phone, open this URL, then add to Home Screen to install the app.
        </p>
        <div className='break-all rounded border p-2 text-xs mb-3'>{url}</div>
        {qr && (
          <div className='flex justify-center mb-3'>
            <img src={qr} alt='QR code' className='h-40 w-40' />
          </div>
        )}
        <p className='text-sm mb-2'>
          2) To bring your notes over, export an encrypted bundle on desktop and import it on your phone.
        </p>
        <div className='flex justify-end gap-2'>
          <Button variant='ghost' size='sm' onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}


