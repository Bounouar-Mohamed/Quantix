import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quantix Dashboard',
  description: 'AI Service Monitoring Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

