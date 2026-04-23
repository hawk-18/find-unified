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
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            fontSize: 'var(--text-body)',
          }}
        >
          无权限访问该页面
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            margin: '0 0 6px',
          }}
        >
          概览
        </h1>
        <p
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}
        >
          Find Unified 后台管理
        </p>
      </div>

      {/* Quick nav cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {[
          { label: '文档更新', desc: '上传和管理文档', href: '/admin/sync' },
          { label: '数据源配置', desc: '配置 MCP 和 SQLite 源', href: '/admin/sources' },
          { label: 'SKILL 配置', desc: '管理检索增强 Skill', href: '/admin/skills' },
          { label: '审计日志', desc: '查看操作记录', href: '/admin/audit' },
        ].map((card) => (
          <a
            key={card.href}
            href={card.href}
            style={{
              display: 'block',
              padding: '20px',
              background: '#fff',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              textDecoration: 'none',
              transition: 'box-shadow 0.15s, border-color 0.15s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-brand)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,56,92,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-body)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: 6,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {card.desc}
            </div>
          </a>
        ))}
      </div>
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
