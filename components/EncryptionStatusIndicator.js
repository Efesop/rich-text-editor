import { Shield, ShieldCheck } from 'lucide-react'
import { useTheme } from 'next-themes'

export default function EncryptionStatusIndicator() {
  const { theme } = useTheme()

  const getStatusClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-800 text-green-400 border-green-600 hover:bg-gray-750'
    } else if (theme === 'dark') {
      return 'bg-blue-900/20 text-blue-400 border-blue-600 hover:bg-blue-900/30'
    } else {
      return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
    }
  }

  return (
    <div 
      className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border transition-all ${getStatusClasses()}`}
      title="Your data is encrypted with AES-256-GCM and PBKDF2-SHA256 key derivation. All data stays on your device."
    >
      <ShieldCheck className="w-3 h-3 mr-1.5" />
      <span className="hidden sm:inline">AES-256 Encrypted</span>
      <span className="sm:hidden">Encrypted</span>
    </div>
  )
}
