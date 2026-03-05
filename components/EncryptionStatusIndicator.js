import { ShieldCheck, ShieldOff } from 'lucide-react'
import { useTheme } from 'next-themes'

export default function EncryptionStatusIndicator ({ currentPage, onEncryptPage }) {
  const { theme } = useTheme()

  if (!currentPage) return null

  const isEncrypted = !!(currentPage.password && currentPage.password.hash)

  const getEncryptedClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-800 text-green-400 border-green-600'
    } else if (theme === 'darkblue') {
      return 'bg-[#1a2035] text-blue-400 border-blue-600/40'
    } else if (theme === 'dark') {
      return 'bg-blue-900/20 text-blue-400 border-blue-600'
    } else {
      return 'bg-blue-50 text-blue-700 border-blue-200'
    }
  }

  const getUnencryptedClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-800 text-yellow-500/70 border-yellow-600/30 hover:text-yellow-400 hover:border-yellow-600/50 cursor-pointer'
    } else if (theme === 'darkblue') {
      return 'bg-[#1a2035] text-[#5d6b88] border-[#2a3454] hover:text-[#8a9bc0] hover:border-[#3a4a6a] cursor-pointer'
    } else if (theme === 'dark') {
      return 'bg-[#232323] text-[#6b6b6b] border-[#3a3a3a] hover:text-[#9a9a9a] hover:border-[#4a4a4a] cursor-pointer'
    } else {
      return 'bg-neutral-100 text-neutral-500 border-neutral-200 hover:text-neutral-700 hover:border-neutral-300 cursor-pointer'
    }
  }

  if (isEncrypted) {
    return (
      <div
        className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border transition-all ${getEncryptedClasses()}`}
        title="Your data is encrypted with AES-256-GCM and PBKDF2-SHA256 key derivation. All data stays on your device."
      >
        <ShieldCheck className="w-3 h-3 mr-1.5" />
        <span className="hidden sm:inline">AES-256 Encrypted</span>
        <span className="sm:hidden">Encrypted</span>
      </div>
    )
  }

  return (
    <button
      onClick={onEncryptPage}
      className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border transition-all ${getUnencryptedClasses()}`}
      title="This page is not encrypted. Click to lock and encrypt it."
    >
      <ShieldOff className="w-3 h-3 mr-1.5" />
      <span className="hidden sm:inline">Not Encrypted</span>
      <span className="sm:hidden">Not Encrypted</span>
    </button>
  )
}
