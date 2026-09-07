import React from 'react'
import { SunMoon, Monitor, Check } from 'lucide-react'
import { ActionSheet } from './ActionSheet'

// Mobile appearance picker (Sep 2026): replaces the cycling theme icon in
// the header. Four swatches you can see, plus "Match <system> appearance",
// which reuses the same match-system logic as the desktop settings popover.

const THEME_TILES = [
  { value: 'light', label: 'Light', sidebar: '#f0f0f0', content: '#ffffff', text: '#171717', muted: '#a3a3a3', border: '#e5e5e5' },
  { value: 'dark', label: 'Dark', sidebar: '#1a1a1a', content: '#0d0d0d', text: '#ececec', muted: '#6b6b6b', border: '#2e2e2e' },
  { value: 'darkblue', label: 'Night', sidebar: '#111827', content: '#0c1017', text: '#e0e6f0', muted: '#5d6b88', border: '#1c2438' },
  { value: 'fallout', label: 'Terminal', sidebar: '#1a251a', content: '#111827', text: '#4ade80', muted: '#16a34a', border: 'rgba(34,197,94,0.3)' }
]

export default function AppearanceSheet ({
  isOpen,
  onClose,
  theme,
  onChooseTheme,
  matchSystem,
  onToggleMatchSystem,
  systemName = 'system'
}) {
  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'
  const isDarkBlue = theme === 'darkblue'

  const primaryText = isFallout ? 'text-green-400' : isDarkBlue ? 'text-[#e0e6f0]' : isDark ? 'text-[#ececec]' : 'text-gray-900'
  const secondaryText = isFallout ? 'text-green-600' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-500'
  const iconClass = isFallout ? 'text-green-500' : isDarkBlue ? 'text-[#5d6b88]' : isDark ? 'text-[#8e8e8e]' : 'text-gray-400'
  const rowHover = isFallout ? 'hover:bg-green-500/20 active:bg-green-500/30' : isDarkBlue ? 'hover:bg-[#232b42] active:bg-[#232b42]' : isDark ? 'hover:bg-[#2a2a2a] active:bg-[#3a3a3a]' : 'hover:bg-gray-100 active:bg-gray-200'
  const accentRing = isFallout ? 'ring-green-500' : 'ring-blue-500'
  const accentBg = isFallout ? 'bg-green-500' : 'bg-blue-500'
  const toggleOff = isFallout ? 'bg-gray-800' : isDarkBlue ? 'bg-[#232b42]' : isDark ? 'bg-[#3a3a3a]' : 'bg-neutral-300'

  return (
    <ActionSheet isOpen={isOpen} onClose={onClose} title="Appearance" icon={SunMoon}>
      <div className="flex justify-between px-5 pt-3 pb-2" role="radiogroup" aria-label="Theme">
        {THEME_TILES.map(tile => {
          const active = theme === tile.value
          return (
            <button
              key={tile.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChooseTheme(tile.value)}
              className="flex flex-col items-center gap-2 active:opacity-80"
            >
              <span
                className={`relative w-[74px] h-[50px] rounded-[10px] overflow-hidden flex ${active ? `ring-2 ${accentRing}` : 'border'}`}
                style={{ background: tile.content, borderColor: active ? undefined : tile.border }}
              >
                <span className="block w-[25px] h-full" style={{ background: tile.sidebar }} />
                <span className="flex-1 px-2 py-2.5 flex flex-col gap-[5px]">
                  <span className="block h-[3px] w-[22px] rounded-sm" style={{ background: tile.text }} />
                  <span className="block h-[2px] w-[30px] rounded-sm" style={{ background: tile.muted }} />
                </span>
                {active && (
                  <span className={`absolute right-1 bottom-1 w-4 h-4 rounded-full flex items-center justify-center ${accentBg}`}>
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span className={`text-xs ${active ? `font-semibold ${primaryText}` : secondaryText} ${isFallout ? 'font-mono' : ''}`}>{tile.label}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!!matchSystem}
        onClick={onToggleMatchSystem}
        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${primaryText} ${rowHover} ${isFallout ? 'font-mono' : ''}`}
      >
        <Monitor className={`w-5 h-5 flex-shrink-0 ${iconClass}`} />
        <span className="text-base flex-1">Match {systemName} appearance</span>
        <span className={`relative inline-block w-11 h-[26px] rounded-full transition-colors flex-shrink-0 ${matchSystem ? accentBg : toggleOff}`}>
          <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${matchSystem ? 'left-[21px]' : 'left-[3px]'}`} />
        </span>
      </button>
      <div className={`px-5 pb-3 pl-[52px] text-xs leading-relaxed ${secondaryText}`}>
        Follows the system light/dark setting. Dark uses the last dark theme you picked.
      </div>
    </ActionSheet>
  )
}
