'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function OverviewContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div style={{ padding: '32px' }}>
      {error === 'forbidden' && (
        <div
          style={{
            marginBottom: '24px',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: '#fef2f2',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            fontSize: 'var(--text-body)',
          }}
        >
          无权限访问该页面
        </div>
      )}
      <h1
        style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: 0,
        }}
      >
        概览
      </h1>
      <p
        style={{
          marginTop: '16px',
          fontSize: 'var(--text-body)',
          color: 'var(--color-text-secondary)',
        }}
      >
        Find Unified 后台管理
      </p>
    </div>
  )
}

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={null}>
      <OverviewContent />
    </Suspense>
  )
}
