'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MOCK_ADMIN_TOKEN, MOCK_DEV_TOKEN } from '@/lib/api-client'

type Role = 'admin' | 'dev' | null

interface NavItem {
  label: string
  href: string
  adminOnly: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: '概览', href: '/admin', adminOnly: false },
  { label: '文档更新', href: '/admin/sync', adminOnly: true },
  { label: '数据源配置', href: '/admin/sources', adminOnly: true },
  { label: 'SKILL 配置', href: '/admin/skills', adminOnly: true },
  { label: 'CLI 策略', href: '/admin/cli', adminOnly: false },
  { label: '审计日志', href: '/admin/audit', adminOnly: true },
]

// admin-only paths
const ADMIN_ONLY_PATHS = ['/admin/sync', '/admin/sources', '/admin/skills', '/admin/audit']

function getRole(token: string): Role {
  if (token === MOCK_ADMIN_TOKEN) return 'admin'
  if (token === MOCK_DEV_TOKEN) return 'dev'
  return null
}

function getUserName(token: string): string {
  if (token === MOCK_ADMIN_TOKEN) return 'Admin User'
  if (token === MOCK_DEV_TOKEN) return 'Dev User'
  return 'Unknown'
}

export function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [role, setRole] = useState<Role>(null)
  const [userName, setUserName] = useState('')
  useEffect(() => {
    const token = localStorage.getItem('find_unified_token') ?? MOCK_ADMIN_TOKEN
    const r = getRole(token)
    const name = getUserName(token)
    setRole(r)
    setUserName(name)

    // Check if current path is admin-only and user is dev
    if (r === 'dev' && ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
      router.replace('/admin?error=forbidden')
    }
  }, [pathname, router])

  if (role === null) return null

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin')

  return (
    <nav
      style={{
        width: '220px',
        flexShrink: 0,
        background: '#fafafa',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Brand header */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--color-brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            F
          </span>
          <span
            style={{
              fontSize: 'var(--text-body)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            管理后台
          </span>
        </div>

        {/* User info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 8,
            background: '#fff',
            border: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--color-surface-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              flexShrink: 0,
            }}
          >
            {userName.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userName}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 4,
                background: role === 'admin' ? 'var(--color-brand)' : 'var(--color-surface-secondary)',
                color: role === 'admin' ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {role === 'admin' ? 'admin' : 'dev'}
            </span>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <ul style={{ listStyle: 'none', margin: 0, padding: '8px 8px', flex: 1 }}>
        {visibleItems.map((item) => {
          const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '9px 12px',
                  fontSize: 'var(--text-body)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  borderRadius: 8,
                  background: isActive ? '#fff2f4' : 'transparent',
                  transition: 'background 0.15s, color 0.15s',
                  marginBottom: 2,
                }}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Back to chat */}
      <div style={{ padding: '12px 8px 16px', borderTop: '1px solid var(--color-border)' }}>
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 12px',
            borderRadius: 8,
            background: 'transparent',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-body)',
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'background 0.15s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          返回对话
        </Link>
      </div>
    </nav>
  )
}

export function ForbiddenMessage() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'var(--text-base)',
        color: 'var(--color-text-secondary)',
      }}
    >
      无权限访问此页面
    </div>
  )
}
