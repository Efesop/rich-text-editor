import React, { useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Menu,
  FileText,
  FileDown,
  Smartphone,
  Import,
  Bug,
  Sun,
  Moon,
  Skull,
  Lock,
  ChevronRight
} from 'lucide-react'
import { ActionSheet, ActionSheetItem, ActionSheetSeparator } from './ActionSheet'
import { shouldShowMobileInstall } from '@/utils/deviceUtils'

/**
 * Consolidated header menu for mobile.
 * Combines Export, Theme, Import, and other options into a single menu.
 */
export function MobileHeaderMenu({
  onExport,
  onImportBundle,
  onPhoneSetup,
  isImporting = false
}) {
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [showExportOptions, setShowExportOptions] = useState(false)

  const isFallout = theme === 'fallout'
  const isDark = theme === 'dark'

  const exportOptions = [
    { label: 'PDF', value: 'pdf', icon: FileText },
    { label: 'Markdown', value: 'markdown', icon: FileText },
    { label: 'Plain Text', value: 'text', icon: FileText },
    { label: 'RTF', value: 'rtf', icon: FileText },
    { label: 'Word Document', value: 'docx', icon: FileText },
    { label: 'CSV', value: 'csv', icon: FileText },
    { label: 'JSON', value: 'json', icon: FileText },
    { label: 'XML', value: 'xml', icon: FileText },
  ]

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('fallout')
    else setTheme('light')
    setIsOpen(false)
  }

  const getThemeIcon = () => {
    if (isFallout) return Skull
    if (isDark) return Moon
    return Sun
  }

  const getThemeLabel = () => {
    if (isFallout) return 'Theme: Fallout'
    if (isDark) return 'Theme: Dark'
    return 'Theme: Light'
  }

  const handleExport = (format) => {
    onExport(format)
    setShowExportOptions(false)
    setIsOpen(false)
  }

  const ThemeIcon = getThemeIcon()

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`
          p-2 rounded-md transition-colors
          ${isFallout
            ? 'text-green-400 hover:bg-green-500/20'
            : isDark
              ? 'text-gray-300 hover:bg-gray-700'
              : 'text-gray-600 hover:bg-gray-100'
          }
        `}
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Main Menu */}
      <ActionSheet
        isOpen={isOpen && !showExportOptions}
        onClose={() => setIsOpen(false)}
        title="Menu"
      >
        <ActionSheetItem
          icon={FileDown}
          label="Export Current Page"
          onClick={() => setShowExportOptions(true)}
        />
        <ActionSheetItem
          icon={Lock}
          label="Export All (Encrypted)"
          onClick={() => handleExport('dashpack')}
        />
        <ActionSheetSeparator />
        <ActionSheetItem
          icon={Import}
          label={isImporting ? 'Importing...' : 'Import Encrypted Bundle'}
          onClick={() => {
            onImportBundle()
            setIsOpen(false)
          }}
          disabled={isImporting}
        />
        <ActionSheetSeparator />
        <ActionSheetItem
          icon={ThemeIcon}
          label={getThemeLabel()}
          onClick={cycleTheme}
        />
        {shouldShowMobileInstall() && (
          <>
            <ActionSheetSeparator />
            <ActionSheetItem
              icon={Smartphone}
              label="Use on Your Phone"
              onClick={() => {
                onPhoneSetup()
                setIsOpen(false)
              }}
            />
          </>
        )}
        <ActionSheetSeparator />
        <ActionSheetItem
          icon={Bug}
          label="Report a Bug"
          onClick={() => {
            window.open('https://github.com/Efesop/rich-text-editor/issues/new', '_blank', 'noopener,noreferrer')
            setIsOpen(false)
          }}
        />
      </ActionSheet>

      {/* Export Options Sub-menu */}
      <ActionSheet
        isOpen={showExportOptions}
        onClose={() => setShowExportOptions(false)}
        title="Export Format"
      >
        {exportOptions.map((option) => (
          <ActionSheetItem
            key={option.value}
            icon={option.icon}
            label={option.label}
            onClick={() => handleExport(option.value)}
          />
        ))}
      </ActionSheet>
    </>
  )
}

export default MobileHeaderMenu
