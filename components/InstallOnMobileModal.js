import React, { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { useTheme } from 'next-themes'
import QRCode from 'qrcode'

export function InstallOnMobileModal ({ isOpen, onClose, pwaUrl }) {
  const { theme } = useTheme()

  // Always use GitHub Pages URL for QR code (works from Electron and web)
  const url = pwaUrl || 'https://efesop.github.io/rich-text-editor/'
  const [qr, setQr] = useState('')

  useEffect(() => {
    let mounted = true
    const gen = async () => {
      try {
        console.log('Generating QR code for URL:', url)
        const dataUrl = await QRCode.toDataURL(url, { 
          margin: 1, 
          scale: 4,
          errorCorrectionLevel: 'M',
          type: 'image/png',
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        })
        if (mounted) {
          setQr(dataUrl)
          console.log('QR code generated successfully')
        }
      } catch (e) {
        console.error('QR code generation failed:', e)
      }
    }
    
    if (url) {
      gen()
    }
    return () => { mounted = false }
  }, [url])

  // Early return AFTER hooks to comply with rules-of-hooks
  if (!isOpen) return null

  // Theme-aware styling
  const getModalStyles = () => {
    if (theme === 'fallout') {
      return {
        overlay: 'fixed inset-0 z-50 flex items-center justify-center bg-black/70',
        modal: 'w-full max-w-lg rounded-xl border-2 border-green-600 bg-gray-900 p-6 shadow-2xl shadow-green-600/20',
        text: 'text-green-400',
        urlBox: 'break-all rounded-lg border border-green-600 bg-gray-800 p-3 text-sm font-mono',
        qrContainer: 'flex justify-center mb-6 p-4 bg-white rounded-lg'
      }
    } else if (theme === 'darkblue') {
      return {
        overlay: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60',
        modal: 'w-full max-w-lg rounded-xl border border-[#1c2438] bg-[#141825] p-6 shadow-2xl',
        text: 'text-[#e0e6f0]',
        urlBox: 'break-all rounded-lg border border-[#1c2438] bg-[#0c1017] p-3 text-sm font-mono text-[#8b99b5]',
        qrContainer: 'flex justify-center mb-6 p-4 bg-white rounded-lg'
      }
    } else if (theme === 'dark') {
      return {
        overlay: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60',
        modal: 'w-full max-w-lg rounded-xl border border-[#3a3a3a] bg-[#1a1a1a] p-6 shadow-2xl',
        text: 'text-[#ececec]',
        urlBox: 'break-all rounded-lg border border-[#3a3a3a] bg-[#2f2f2f] p-3 text-sm font-mono text-[#c0c0c0]',
        qrContainer: 'flex justify-center mb-6 p-4 bg-white rounded-lg'
      }
    } else {
      return {
        overlay: 'fixed inset-0 z-50 flex items-center justify-center bg-black/50',
        modal: 'w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-2xl',
        text: 'text-gray-900',
        urlBox: 'break-all rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm font-mono text-gray-700',
        qrContainer: 'flex justify-center mb-6 p-2 bg-gray-50 rounded-lg'
      }
    }
  }

  const styles = getModalStyles()

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <h2 className={`text-xl font-bold mb-4 ${styles.text}`}>📱 Install Dash on Your Phone</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className={`text-sm font-semibold mb-2 ${styles.text}`}>Step 1: Scan QR Code</h3>
            {qr && (
              <div className={styles.qrContainer}>
                <img src={qr} alt='QR code to install Dash PWA' className='h-48 w-48' />
              </div>
            )}
          </div>

          <div>
            <h3 className={`text-sm font-semibold mb-2 ${styles.text}`}>Or visit this URL:</h3>
            <div className={styles.urlBox}>{url}</div>
          </div>

          <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-gray-800 border border-green-600' : theme === 'darkblue' ? 'bg-[#1a2035] border border-[#1c2438]' : theme === 'dark' ? 'bg-[#2f2f2f] border border-[#3a3a3a]' : 'bg-blue-50 border border-blue-200'}`}>
            <h3 className={`text-sm font-semibold mb-2 ${styles.text}`}>Step 2: Add to Home Screen</h3>
            <p className={`text-sm ${theme === 'fallout' ? 'text-green-300' : theme === 'darkblue' ? 'text-[#8b99b5]' : theme === 'dark' ? 'text-[#c0c0c0]' : 'text-gray-700'}`}>
              In Safari, tap the <strong>Share</strong> button, then tap <strong>&quot;Add to Home Screen&quot;</strong>
            </p>
          </div>

          <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-gray-800 border border-green-600' : theme === 'darkblue' ? 'bg-[#1a2035] border border-[#1c2438]' : theme === 'dark' ? 'bg-[#2f2f2f] border border-[#3a3a3a]' : 'bg-gray-50 border border-gray-200'}`}>
            <h3 className={`text-sm font-semibold mb-2 ${styles.text}`}>Step 3: Transfer Your Notes</h3>
            <p className={`text-sm ${theme === 'fallout' ? 'text-green-300' : theme === 'darkblue' ? 'text-[#8b99b5]' : theme === 'dark' ? 'text-[#c0c0c0]' : 'text-gray-700'}`}>
              Export encrypted bundle from desktop → Share via AirDrop/email → Import on phone
            </p>
          </div>
        </div>

        <div className='flex justify-end gap-3 mt-6'>
          <Button 
            variant='ghost' 
            size='sm' 
            onClick={onClose}
            className={theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : theme === 'darkblue' ? 'text-[#8b99b5] hover:bg-[#232b42]' : ''}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}


