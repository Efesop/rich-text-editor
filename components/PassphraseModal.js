'use client'

import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function PassphraseModal ({
  isOpen,
  title = 'Enter passphrase',
  confirmLabel = 'Confirm',
  onConfirm,
  onClose,
  error
}) {
  const [pass, setPass] = useState('')
  const { theme } = useTheme()

  useEffect(() => {
    if (!isOpen) setPass('')
  }, [isOpen])

  const getModalStyles = () => {
    if (theme === 'fallout') {
      return {
        backdrop: 'fixed inset-0 z-50 flex items-center justify-center bg-black/80',
        modal: 'w-full max-w-md rounded-lg border border-green-600 bg-gray-900 p-6 shadow-2xl',
        title: 'text-lg font-semibold mb-4 font-mono text-green-400',
        text: 'text-green-300 font-mono'
      }
    } else if (theme === 'dark') {
      return {
        backdrop: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60',
        modal: 'w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-2xl',
        title: 'text-lg font-semibold mb-4 text-white',
        text: 'text-gray-300'
      }
    }
    return {
      backdrop: 'fixed inset-0 z-50 flex items-center justify-center bg-black/50',
      modal: 'w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-2xl',
      title: 'text-lg font-semibold mb-4 text-gray-900',
      text: 'text-gray-700'
    }
  }

  const getInputStyles = () => {
    if (theme === 'fallout') {
      return 'mb-3 bg-gray-800 border-green-600 text-green-300 placeholder:text-green-600 focus:border-green-400 focus:ring-green-400/20 font-mono'
    } else if (theme === 'dark') {
      return 'mb-3 bg-gray-800 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500/20'
    }
    return 'mb-3 bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500/20'
  }

  const getErrorStyles = () => {
    if (theme === 'fallout') {
      return 'text-red-400 text-sm mb-3 font-mono'
    } else if (theme === 'dark') {
      return 'text-red-400 text-sm mb-3'
    }
    return 'text-red-600 text-sm mb-3'
  }

  if (!isOpen) return null

  const styles = getModalStyles()

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h2 className={styles.title}>{title}</h2>
        <Input
          type='password'
          placeholder='Enter your passphrase'
          value={pass}
          onChange={e => setPass(e.target.value)}
          className={getInputStyles()}
          autoFocus
        />
        {error && <div className={getErrorStyles()}>{error}</div>}
        <div className='flex justify-end gap-3 mt-4'>
          <Button 
            variant='ghost' 
            size='sm' 
            onClick={onClose}
            className={theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20 font-mono' : ''}
          >
            Cancel Encryption
          </Button>
          <Button 
            size='sm' 
            onClick={() => onConfirm?.(pass)} 
            disabled={!pass}
            className={theme === 'fallout' ? 'bg-green-600 text-gray-900 hover:bg-green-500 font-mono' : theme === 'dark' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-600'}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}


