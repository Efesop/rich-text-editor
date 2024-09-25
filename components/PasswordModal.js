import React from 'react';
import { useTheme } from 'next-themes';

const PasswordModal = ({ isOpen, onClose, onConfirm, action, password, onPasswordChange }) => {
	const { theme } = useTheme();

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
			<div className={`rounded-lg shadow-xl border p-6 w-80 ${
				theme === 'dark' 
					? 'bg-gray-800 border-gray-700 text-white' 
					: 'bg-white border-gray-200 text-black'
			}`}>
				<h2 className="mb-4 text-xl font-semibold">
					{action === 'access' ? 'Enter Password' : `${action.charAt(0).toUpperCase() + action.slice(1)} Page`}
				</h2>
				<input
					type="password"
					value={password}
					onChange={(e) => onPasswordChange(e.target.value)}
					className={`w-full p-2 mb-4 text-sm border rounded ${
						theme === 'dark' 
							? 'bg-gray-700 border-gray-600 text-white' 
							: 'bg-white border-gray-300 text-black'
					}`}
					placeholder="Enter password"
				/>
				<div className="flex justify-end space-x-2">
					<button
						onClick={onClose}
						className={`px-4 py-2 text-sm rounded ${
							theme === 'dark'
								? 'bg-gray-700 hover:bg-gray-600 text-white'
								: 'bg-gray-200 hover:bg-gray-300 text-black'
						}`}
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						className={`px-4 py-2 text-sm rounded ${
							theme === 'dark'
								? 'bg-blue-600 hover:bg-blue-700 text-white'
								: 'bg-blue-500 hover:bg-blue-600 text-white'
						}`}
					>
						Confirm
					</button>
				</div>
			</div>
		</div>
	)
};

export default PasswordModal;