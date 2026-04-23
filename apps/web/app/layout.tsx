import type { Metadata } from 'next'
import './globals.css'
import '@/styles/tokens.css'
import { Providers } from '@/lib/providers'

export const metadata: Metadata = {
  title: 'Find Unified',
  description: 'Find Unified - Knowledge Search',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, height: '100%' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
