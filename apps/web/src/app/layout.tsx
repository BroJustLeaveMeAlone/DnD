import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TTRPG Platform',
  description: 'Build and play tabletop RPGs. 5e is the starter kit, not the ceiling.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
