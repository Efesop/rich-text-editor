import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import PasswordStrengthMeter from './PasswordStrengthMeter'

const PasswordModal = ({ isOpen, onClose, onConfirm, action, error, onPasswordChange, password }) => {
	const { theme } = useTheme()
	const inputRef = useRef(null)

	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus()
		}
	}, [isOpen])

	const getTitle = () => {
		return action === 'lock' ? 'Lock Page' : 'Unlock/Manage Page'
	}

	const getDescription = () => {
		if (action === 'lock') {
			return 'Enter a password to lock this page. You\'ll need it to view or edit the page later.'
		} else {
			return 'Enter the password to access this locked page.'
		}
	}

	const getModalClasses = () => {
		if (theme === 'fallout') {
			return 'bg-gray-900 border-green-600 text-green-400 shadow-[0_0_20px_rgba(0,255,0,0.3)]'
		} else if (theme === 'dark') {
			return 'bg-gray-800 border-gray-700 text-white'
		} else {
			return 'bg-white border-gray-200 text-black'
		}
	}

	const getInputClasses = () => {
		if (theme === 'fallout') {
			return 'bg-gray-800 border-green-600 text-green-400 shadow-[0_0_5px_rgba(0,255,0,0.3)] font-mono'
		} else if (theme === 'dark') {
			return 'bg-gray-700 border-gray-600 text-white'
		} else {
			return 'bg-white border-gray-300 text-black'
		}
	}

	const buttonClass = (type) => {
		const baseClasses = 'px-4 py-2 text-sm font-medium rounded transition-all duration-200'
		
		if (theme === 'fallout') {
			switch (type) {
				case 'primary':
					return `${baseClasses} bg-green-600 hover:bg-green-700 text-gray-900 shadow-[0_0_5px_rgba(0,255,0,0.4)] font-mono`
				case 'danger':
					return `${baseClasses} bg-red-600 hover:bg-red-700 text-white shadow-[0_0_5px_rgba(255,0,0,0.4)] font-mono`
				default:
					return `${baseClasses} bg-gray-700 hover:bg-gray-600 text-green-400 border border-green-600 font-mono`
			}
		} else if (theme === 'dark') {
			switch (type) {
				case 'primary':
					return `${baseClasses} bg-blue-600 hover:bg-blue-700 text-white`
				case 'danger':
					return `${baseClasses} bg-red-600 hover:bg-red-700 text-white`
				default:
					return `${baseClasses} bg-gray-600 hover:bg-gray-500 text-white`
			}
		} else {
			switch (type) {
				case 'primary':
					return `${baseClasses} bg-blue-500 hover:bg-blue-600 text-white`
				case 'danger':
					return `${baseClasses} bg-red-500 hover:bg-red-600 text-white`
				default:
					return `${baseClasses} bg-gray-300 hover:bg-gray-400 text-gray-700`
			}
		}
	}

	const getErrorClasses = () => {
		if (theme === 'fallout') {
			return 'text-red-400 font-mono'
		} else if (theme === 'dark') {
			return 'text-red-400'
		} else {
			return 'text-red-600'
		}
	}

	const renderButtons = () => {
		if (action === 'lock') {
			return (
				<>
					<button onClick={onClose} className={buttonClass('cancel')}>Cancel</button>
					<button onClick={() => onConfirm('lock', password)} className={buttonClass('primary')}>Lock Page</button>
				</>
			)
		} else {
			return (
				<>
					<button onClick={onClose} className={buttonClass('cancel')}>Cancel</button>
					<button onClick={() => onConfirm('open', password)} className={buttonClass('primary')}>Open</button>
					<button onClick={() => onConfirm('removeLock', password)} className={buttonClass('danger')}>Remove Lock</button>
				</>
			)
		}
	}

	if (!isOpen) return null

	return (
		<div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
			<div className={`rounded-lg shadow-xl border p-6 w-96 ${getModalClasses()}`}>
				<h2 className={`mb-4 text-xl font-semibold ${theme === 'fallout' ? 'font-mono text-green-400' : ''}`}>
					{getTitle()}
				</h2>
				<p className={`mb-4 text-sm ${theme === 'fallout' ? 'font-mono text-green-300' : ''}`}>
					{getDescription()}
				</p>
				<input
					ref={inputRef}
					type="password"
					value={password}
					onChange={(e) => onPasswordChange(e.target.value)}
					className={`w-full p-2 mb-2 text-sm border rounded ${getInputClasses()}`}
					placeholder="Enter password"
				/>
				{action === 'lock' && (
					<PasswordStrengthMeter password={password} />
				)}
				{error && (
					<p className={`text-sm mb-4 ${getErrorClasses()}`}>
						{error}
					</p>
				)}
				<div className="flex justify-end space-x-2">
					{renderButtons()}
				</div>
			</div>
		</div>
	)
}

export default PasswordModal