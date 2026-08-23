import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Underwater Report Builder',
  description: 'PC-first local underwater work report demo',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
