'use client'

import * as Select from '@radix-ui/react-select'
import { CLI_OPTIONS, type CliValue } from '@/lib/queries/cli'

interface CliSelectorProps {
  value: CliValue
  onChange: (value: CliValue) => void
  disabled?: boolean
}

export function CliSelector({ value, onChange, disabled }: CliSelectorProps) {
  const label = CLI_OPTIONS.find((o) => o.value === value)?.label ?? value

  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as CliValue)} disabled={disabled}>
      <Select.Trigger
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          height: 36,
          padding: '0 12px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-bg)',
          fontSize: 'var(--text-body)',
          color: 'var(--color-text-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          minWidth: 160,
        }}
      >
        <Select.Value>{label}</Select.Value>
        <Select.Icon style={{ color: 'var(--color-text-secondary)', fontSize: 10 }}>▼</Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-card)',
            zIndex: 9999,
            minWidth: 160,
            overflow: 'hidden',
          }}
        >
          <Select.Viewport>
            {CLI_OPTIONS.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                style={{
                  padding: '8px 12px',
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background =
                    'var(--color-surface-secondary)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
