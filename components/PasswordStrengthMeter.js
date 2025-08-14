import React from 'react'
import { useTheme } from 'next-themes'
import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'

const PasswordStrengthMeter = ({ password }) => {
  const { theme } = useTheme()

  // Calculate password strength
  const calculateStrength = (pwd) => {
    if (!pwd) return { score: 0, feedback: [] }
    
    let score = 0
    const feedback = []
    
    // Length check
    if (pwd.length >= 8) {
      score += 25
    } else {
      feedback.push('Use at least 8 characters')
    }
    
    if (pwd.length >= 12) {
      score += 10
    }
    
    // Character variety checks
    if (/[a-z]/.test(pwd)) {
      score += 15
    } else {
      feedback.push('Include lowercase letters')
    }
    
    if (/[A-Z]/.test(pwd)) {
      score += 15
    } else {
      feedback.push('Include uppercase letters')
    }
    
    if (/[0-9]/.test(pwd)) {
      score += 15
    } else {
      feedback.push('Include numbers')
    }
    
    if (/[^a-zA-Z0-9]/.test(pwd)) {
      score += 20
    } else {
      feedback.push('Include special characters (!@#$%^&*)')
    }
    
    // Common password penalties
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein', 'welcome']
    if (commonPasswords.some(common => pwd.toLowerCase().includes(common))) {
      score = Math.max(0, score - 30)
      feedback.push('Avoid common passwords')
    }
    
    // Repetition penalty
    if (/(.)\1{2,}/.test(pwd)) {
      score = Math.max(0, score - 15)
      feedback.push('Avoid repeating characters')
    }
    
    return { score: Math.min(100, score), feedback }
  }

  const { score, feedback } = calculateStrength(password)
  
  const getStrengthLevel = () => {
    if (score >= 80) return { level: 'strong', label: 'Strong', icon: ShieldCheck }
    if (score >= 60) return { level: 'good', label: 'Good', icon: Shield }
    if (score >= 40) return { level: 'fair', label: 'Fair', icon: ShieldAlert }
    return { level: 'weak', label: 'Weak', icon: ShieldX }
  }

  const getProgressBarClasses = () => {
    const { level } = getStrengthLevel()
    
    if (theme === 'fallout') {
      switch (level) {
        case 'strong': return 'bg-green-500 shadow-[0_0_5px_rgba(0,255,0,0.5)]'
        case 'good': return 'bg-green-400 shadow-[0_0_3px_rgba(0,255,0,0.3)]'
        case 'fair': return 'bg-yellow-400 shadow-[0_0_3px_rgba(255,255,0,0.3)]'
        default: return 'bg-red-400 shadow-[0_0_3px_rgba(255,0,0,0.3)]'
      }
    } else if (theme === 'dark') {
      switch (level) {
        case 'strong': return 'bg-green-500'
        case 'good': return 'bg-green-400'
        case 'fair': return 'bg-yellow-400'
        default: return 'bg-red-400'
      }
    } else {
      switch (level) {
        case 'strong': return 'bg-green-500'
        case 'good': return 'bg-green-400'
        case 'fair': return 'bg-yellow-500'
        default: return 'bg-red-500'
      }
    }
  }

  const getTextClasses = () => {
    const { level } = getStrengthLevel()
    
    if (theme === 'fallout') {
      switch (level) {
        case 'strong': return 'text-green-400 font-mono'
        case 'good': return 'text-green-300 font-mono'
        case 'fair': return 'text-yellow-400 font-mono'
        default: return 'text-red-400 font-mono'
      }
    } else if (theme === 'dark') {
      switch (level) {
        case 'strong': return 'text-green-400'
        case 'good': return 'text-green-300'
        case 'fair': return 'text-yellow-400'
        default: return 'text-red-400'
      }
    } else {
      switch (level) {
        case 'strong': return 'text-green-600'
        case 'good': return 'text-green-500'
        case 'fair': return 'text-yellow-600'
        default: return 'text-red-600'
      }
    }
  }

  const getBackgroundClasses = () => {
    if (theme === 'fallout') {
      return 'bg-gray-800 border border-green-600'
    } else if (theme === 'dark') {
      return 'bg-gray-700 border border-gray-600'
    } else {
      return 'bg-gray-100 border border-gray-200'
    }
  }

  if (!password) return null

  const strength = getStrengthLevel()
  const Icon = strength.icon

  return (
    <div className={`p-3 rounded-md mb-2 ${getBackgroundClasses()}`}>
      {/* Strength indicator */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <Icon className={`w-4 h-4 mr-2 ${getTextClasses()}`} />
          <span className={`text-sm font-medium ${getTextClasses()}`}>
            Password Strength: {strength.label}
          </span>
        </div>
        <span className={`text-xs ${getTextClasses()}`}>
          {score}/100
        </span>
      </div>
      
      {/* Progress bar */}
      <div className={`w-full h-2 rounded-full mb-2 ${theme === 'fallout' ? 'bg-gray-900' : theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}`}>
        <div 
          className={`h-full rounded-full transition-all duration-300 ${getProgressBarClasses()}`}
          style={{ width: `${score}%` }}
        />
      </div>
      
      {/* Feedback */}
      {feedback.length > 0 && (
        <div className={`text-xs ${theme === 'fallout' ? 'text-green-300 font-mono' : theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
          <div className="font-medium mb-1">Suggestions:</div>
          <ul className="list-disc list-inside space-y-0.5">
            {feedback.slice(0, 3).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default PasswordStrengthMeter
