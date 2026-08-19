import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, ChevronDown, Check, X } from 'lucide-react'

export default function SearchableSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found',
  required = false,
  disabled = false,
  error = null,
  helperText = null,
  className = '',
  style = {},
  renderOption = null,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)

  // Find the currently selected option
  const selectedOption = useMemo(() => {
    return options.find(opt => String(opt.id ?? opt.value) === String(value)) || null
  }, [options, value])

  // Filter options based on search query (searching name, email, label, subtitle, etc.)
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options
    const q = searchQuery.toLowerCase().trim()
    return options.filter(opt => {
      const nameMatch = (opt.name || opt.label || '').toLowerCase().includes(q)
      const emailMatch = (opt.email || '').toLowerCase().includes(q)
      const subMatch = (opt.subtitle || opt.description || opt.trainingTitle || '').toLowerCase().includes(q)
      return nameMatch || emailMatch || subMatch
    })
  }, [options, searchQuery])

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredOptions])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  const handleSelect = (option) => {
    if (option.disabled) return
    const optVal = String(option.id ?? option.value)
    onChange(optVal)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setSearchQuery('')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex])
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`searchable-select-container ${className}`}
      style={{ position: 'relative', width: '100%', ...style }}
    >
      {label && (
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#334155',
            display: 'block',
            marginBottom: 5,
          }}
        >
          {label}
        </label>
      )}

      {/* Trigger Button / Input Box */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(prev => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          width: '100%',
          padding: '9px 12px',
          border: `1px solid ${isOpen ? '#16a34a' : error ? '#dc2626' : '#e2e8f0'}`,
          borderRadius: 8,
          fontSize: 13,
          fontFamily: 'Inter, system-ui, sans-serif',
          background: disabled ? '#f8fafc' : '#ffffff',
          color: selectedOption ? '#0f172a' : '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          boxShadow: isOpen ? '0 0 0 3px rgba(22, 163, 74, 0.1)' : error ? '0 0 0 3px rgba(220, 38, 38, 0.1)' : 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? (
            <span style={{ color: '#0f172a', fontWeight: 500 }}>
              {selectedOption.name || selectedOption.label}
              {selectedOption.email ? ` (${selectedOption.email})` : ''}
            </span>
          ) : (
            <span style={{ color: '#94a3b8' }}>{placeholder}</span>
          )}
        </div>

        <ChevronDown
          size={15}
          color="#64748b"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            overflow: 'hidden',
            animation: 'dropdownFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Top Search Input */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #f1f5f9',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Search size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                fontSize: 13,
                fontFamily: 'inherit',
                color: '#0f172a',
                outline: 'none',
                padding: 0,
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Options List */}
          <div
            ref={listRef}
            role="listbox"
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: 12.5,
                }}
              >
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const optId = String(opt.id ?? opt.value)
                const isSelected = String(value) === optId
                const isHighlighted = idx === highlightedIndex
                const isDisabled = !!opt.disabled

                if (renderOption) {
                  return (
                    <div
                      key={optId}
                      onClick={() => handleSelect(opt)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                    >
                      {renderOption(opt, { isSelected, isHighlighted, isDisabled })}
                    </div>
                  )
                }

                return (
                  <div
                    key={optId}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isDisabled}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.5 : 1,
                      background: isSelected
                        ? '#f0fdf4'
                        : isHighlighted
                        ? '#f8fafc'
                        : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? '#166534' : '#1e293b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {opt.name || opt.label}
                        </span>
                        {opt.badge && (
                          <span
                            style={{
                              fontSize: 10.5,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: '#fee2e2',
                              color: '#991b1b',
                              fontWeight: 600,
                            }}
                          >
                            {opt.badge}
                          </span>
                        )}
                        {opt.activeInterviews > 0 && (
                          <span
                            style={{
                              fontSize: 10.5,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: '#e0e7ff',
                              color: '#4338ca',
                              fontWeight: 500,
                            }}
                          >
                            {opt.activeInterviews} active
                          </span>
                        )}
                      </div>

                      {(opt.email || opt.subtitle || opt.training?.title) && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: isSelected ? '#15803d' : '#64748b',
                            marginTop: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {opt.email && <span>{opt.email}</span>}
                          {opt.training?.title && (
                            <span> · {opt.training.title}</span>
                          )}
                          {opt.subtitle && (
                            <span> · {opt.subtitle}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <Check size={16} color="#16a34a" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Helper text or error message */}
      {(error || helperText) && (
        <span
          style={{
            fontSize: 11,
            color: error ? '#dc2626' : '#64748b',
            marginTop: 4,
            display: 'block',
          }}
        >
          {error || helperText}
        </span>
      )}
    </div>
  )
}
