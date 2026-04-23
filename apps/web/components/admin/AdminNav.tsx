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
        background: 'var(--color-bg)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* User info */}
      <div
        style={{
          padding: '24px 16px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-body)',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            marginBottom: '6px',
          }}
        >
          {userName}
        </div>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 'var(--radius-md)',
            background: role === 'admin' ? 'var(--color-brand)' : 'var(--color-surface-secondary)',
            color: role === 'admin' ? '#fff' : 'var(--color-text-secondary)',
          }}
        >
          {role === 'admin' ? 'admin' : 'dev'}
        </span>
      </div>

      {/* Nav items */}
      <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0', flex: 1 }}>
        {visibleItems.map((item) => {
          const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 16px',
                  fontSize: 'var(--text-body)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  borderLeft: isActive ? '3px solid var(--color-brand)' : '3px solid transparent',
                  background: isActive ? 'var(--color-surface-secondary)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
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
