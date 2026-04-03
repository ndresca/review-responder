import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Review Responder',
  description: 'Automated Google review responses for restaurants',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
