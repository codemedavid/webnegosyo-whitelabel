import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Menu - Restaurant',
  description: 'Browse our menu and order your favorite dishes',
}

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return children
}

