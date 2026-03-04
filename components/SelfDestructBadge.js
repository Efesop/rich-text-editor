import React, { useState, useEffect } from 'react'
import { Timer } from 'lucide-react'

function formatCountdown(targetTimestamp) {
  const now = Date.now()
  const remaining = targetTimestamp - now

  if (remaining <= 0) return { text: 'Expired', urgent: true }

  const totalMinutes = Math.floor(remaining / (1000 * 60))
  const totalHours = Math.floor(remaining / (1000 * 60 * 60))
  const totalDays = Math.floor(remaining / (1000 * 60 * 60 * 24))

  if (totalDays > 0) {
    const hours = totalHours - totalDays * 24
    return { text: `${totalDays}d ${hours}h`, urgent: totalDays <= 1 }
  }

  const minutes = totalMinutes - totalHours * 60
  if (totalHours > 0) {
    return { text: `${totalHours}h ${minutes}m`, urgent: totalHours <= 2 }
  }

  return { text: `${minutes}m`, urgent: true }
}

export default function SelfDestructBadge({ selfDestructAt, theme }) {
  const [countdown, setCountdown] = useState(() => formatCountdown(selfDestructAt))

  useEffect(() => {
    setCountdown(formatCountdown(selfDestructAt))
    const interval = setInterval(() => {
      setCountdown(formatCountdown(selfDestructAt))
    }, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [selfDestructAt])

  if (!selfDestructAt) return null

  const isFallout = theme === 'fallout'

  const colorClass = countdown.urgent
    ? isFallout
      ? 'bg-red-500/20 text-red-400 border-red-500/30'
      : 'bg-red-500/15 text-red-500 border-red-500/20'
    : isFallout
      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      : 'bg-orange-500/15 text-orange-500 border-orange-500/20'

  return (
    <span className={`
      inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border flex-shrink-0
      ${isFallout ? 'font-mono' : ''}
      ${colorClass}
    `}>
      <Timer className="h-3 w-3" />
      {countdown.text}
    </span>
  )
}
