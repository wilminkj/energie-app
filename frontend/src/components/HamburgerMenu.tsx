import { useState, useRef, useEffect } from 'react'

type Page = 'app' | 'info'

interface HamburgerMenuProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const menuItems: { page: Page; label: string }[] = [
  { page: 'app', label: 'Energie Netwerk Overzicht' },
  { page: 'info', label: 'Info & feedback' },
]

export function HamburgerMenu({ activePage, onNavigate }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded hover:bg-gray-100 transition-colors"
        aria-label="Menu"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="5" x2="17" y2="5" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="15" x2="17" y2="15" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {menuItems.map(({ page, label }) => (
            <button
              key={page}
              onClick={() => { onNavigate(page); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                activePage === page
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
