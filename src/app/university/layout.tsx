import type { Metadata } from 'next'
import { UniversityShell } from '@/components/university/chrome'

export const metadata: Metadata = {
  title: {
    default: 'SmartMenu University',
    template: '%s · SmartMenu University',
  },
  description:
    'Free video courses and guides from SmartMenu by WebNegosyo: set up your online menu, engineer it to sell more, and run your food business better.',
  robots: { index: true, follow: true },
}

export default function UniversityLayout({ children }: { children: React.ReactNode }) {
  return <UniversityShell>{children}</UniversityShell>
}
