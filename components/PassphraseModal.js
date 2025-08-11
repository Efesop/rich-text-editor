'use client'

import React, { useState, useEffect } from 'react'
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

  useEffect(() => {
    if (!isOpen) setPass('')
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='w-full max-w-sm rounded-lg border bg-white p-4 dark:bg-gray-900 dark:text-white'>
        <h2 className='text-lg font-semibold mb-3'>{title}</h2>
        <Input
          type='password'
          placeholder='Passphrase'
          value={pass}
          onChange={e => setPass(e.target.value)}
          className='mb-2'
        />
        {error && <div className='text-red-500 text-sm mb-2'>{error}</div>}
        <div className='flex justify-end gap-2'>
          <Button variant='ghost' size='sm' onClick={onClose}>Cancel</Button>
          <Button size='sm' onClick={() => onConfirm?.(pass)} disabled={!pass}>${'{'}confirmLabel{'}'}</Button>
        </div>
      </div>
    </div>
  )
}


