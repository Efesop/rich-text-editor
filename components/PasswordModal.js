import React from 'react';
import { useTheme } from 'next-themes';

const PasswordModal = ({ isOpen, onClose, onConfirm, action, password, onPasswordChange, error }) => {
	const { theme } = useTheme();

	if (!isOpen) return null;

	const getTitle = () => {
		switch (action) {
			case 'lock':
				return 'Set Password'
			case 'unlock':
			case 'access':
				return 'Locked Page'
			default:
				return 'Password Required'
		}
	};

	const getDescription = () => {
		switch (action) {
			case 'lock':
				return 'Enter a password to lock this page:'
			case 'unlock':
			case 'access':
				return 'This page is locked. Enter the password to proceed:'
			default:
				return 'Please enter the password:'
		}
	};

	const handleAction = (actionType) => {
		onConfirm(actionType, password)
	}

	const buttonClass = (type) => {
		const baseClass = 'px-4 py-2 text-sm rounded '
		switch (type) {
			case 'cancel':
				return baseClass + (theme === 'dark'
					? 'bg-gray-700 hover:bg-gray-600 text-white'
					: 'bg-gray-200 hover:bg-gray-300 text-black')
			case 'primary':
				return baseClass + (theme === 'dark'
					? 'bg-blue-600 hover:bg-blue-700 text-white'
					: 'bg-blue-500 hover:bg-blue-600 text-white')
			case 'danger':
				return baseClass + (theme === 'dark'
					? 'bg-red-900 hover:bg-red-800 text-white border border-red-700'
					: 'bg-red-100 hover:bg-red-200 text-red-800 border border-red-300')
			default:
				return baseClass
		}
	};

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

	return (
		<div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
			<div className={`rounded-lg shadow-xl border p-6 w-96 ${
				theme === 'dark' 
					? 'bg-gray-800 border-gray-700 text-white' 
					: 'bg-white border-gray-200 text-black'
			}`}>
				<h2 className="mb-4 text-xl font-semibold">{getTitle()}</h2>
				<p className="mb-4 text-sm">{getDescription()}</p>
				<input
					type="password"
					value={password}
					onChange={(e) => onPasswordChange(e.target.value)}
					className={`w-full p-2 mb-2 text-sm border rounded ${
						theme === 'dark' 
							? 'bg-gray-700 border-gray-600 text-white' 
							: 'bg-white border-gray-300 text-black'
					}`}
					placeholder="Enter password"
				/>
				{error && (
					<p className={`text-sm mb-4 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
						{error}
					</p>
				)}
				<div className="flex justify-end space-x-2">
					{renderButtons()}
				</div>
			</div>
		</div>
	)
};

export default PasswordModal;