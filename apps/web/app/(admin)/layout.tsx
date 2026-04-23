import { AdminNav } from '@/components/admin/AdminNav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      <AdminNav />
      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
    </div>
  )
}
