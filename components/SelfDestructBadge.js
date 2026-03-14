import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Timer } from 'lucide-react'

const MILESTONES = [
  { threshold: 10 * 60 * 1000, key: '10m', animation: 'dash-sd-pulse', duration: 600 },
  { threshold: 5 * 60 * 1000, key: '5m', animation: 'dash-sd-pulse-double', duration: 800 },
  { threshold: 60 * 1000, key: '1m', animation: 'dash-sd-shake', duration: 500 },
  { threshold: 10 * 1000, key: '10s', animation: 'dash-sd-urgent-pulse', duration: 0 } // 0 = continuous
]

function formatCountdown (targetTimestamp) {
  const now = Date.now()
  const remaining = targetTimestamp - now

  if (remaining <= 0) return { text: 'Expired', urgent: true, remaining: 0, expired: true }

  const totalSeconds = Math.floor(remaining / 1000)
  const totalMinutes = Math.floor(remaining / (1000 * 60))
  const totalHours = Math.floor(remaining / (1000 * 60 * 60))
  const totalDays = Math.floor(remaining / (1000 * 60 * 60 * 24))

  if (totalDays > 0) {
    const hours = totalHours - totalDays * 24
    return { text: `${totalDays}d ${hours}h`, urgent: totalDays <= 1, remaining }
  }

  if (totalHours > 0) {
    const minutes = totalMinutes - totalHours * 60
    return { text: `${totalHours}h ${minutes}m`, urgent: totalHours <= 2, remaining }
  }

  if (remaining <= 60 * 1000) {
    return { text: `${totalSeconds}s`, urgent: true, remaining }
  }

  return { text: `${totalMinutes}m`, urgent: true, remaining }
}

function getTickInterval (remaining) {
  if (remaining <= 60 * 1000) return 1000
  if (remaining <= 10 * 60 * 1000) return 5000
  if (remaining <= 60 * 60 * 1000) return 30000
  return 60000
}

export default function SelfDestructBadge ({ selfDestructAt, theme }) {
  const [countdown, setCountdown] = useState(() => formatCountdown(selfDestructAt))
  const [animationClass, setAnimationClass] = useState('')
  const firedMilestones = useRef(new Set())
  const animationTimeout = useRef(null)

  const checkMilestones = useCallback((remaining) => {
    for (const milestone of MILESTONES) {
      if (remaining <= milestone.threshold && remaining > 0 && !firedMilestones.current.has(milestone.key)) {
        firedMilestones.current.add(milestone.key)

        if (milestone.duration === 0) {
          // Continuous animation (10s milestone)
          setAnimationClass(milestone.animation)
        } else {
          setAnimationClass(milestone.animation)
          if (animationTimeout.current) clearTimeout(animationTimeout.current)
          animationTimeout.current = setTimeout(() => {
            setAnimationClass(prev => prev === milestone.animation ? '' : prev)
          }, milestone.duration)
        }
        break
      }
    }
  }, [])

  useEffect(() => {
    firedMilestones.current.clear()
    setAnimationClass('')

    const tick = () => {
      const result = formatCountdown(selfDestructAt)
      setCountdown(result)
      checkMilestones(result.remaining)
      return result
    }

    const result = tick()
    let intervalId = null

    const scheduleNext = () => {
      const current = formatCountdown(selfDestructAt)
      const interval = getTickInterval(current.remaining)
      intervalId = setTimeout(() => {
        tick()
        if (current.remaining > 0) scheduleNext()
      }, interval)
    }

    if (result.remaining > 0) scheduleNext()

    return () => {
      if (intervalId) clearTimeout(intervalId)
      if (animationTimeout.current) clearTimeout(animationTimeout.current)
    }
  }, [selfDestructAt, checkMilestones])

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
      ${animationClass}
      ${countdown.expired ? 'dash-sd-expired-flash' : ''}
    `}>
      <Timer className={`h-3 w-3 ${countdown.remaining <= 5 * 60 * 1000 && countdown.remaining > 0 ? 'dash-sd-icon-pulse' : ''}`} />
      <span key={countdown.text} style={{ animation: 'dash-sd-tick 200ms ease-out' }}>{countdown.text}</span>
    </span>
  )
}
