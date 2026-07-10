import SearchDialog from '@/components/search';

import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

export const metadata: Metadata = {
  title: 'Rollipop',
  description:
    'The Build Tool for React Native. Rollipop is a modern build toolkit powered by Rolldown.',
};

const inter = Inter({
  subsets: ['latin'],
});

const gaId = process.env.GA_ID;
const gaScript = [
  `window.dataLayer = window.dataLayer || [];`,
  `function gtag(){dataLayer.push(arguments);}`,
  `gtag('js', new Date());`,
  `gtag('config', '${gaId}');`,
].join('\n');

export default function Layout({ children }: LayoutProps<'/'>) {
  const GA_SRC = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;

  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <meta property="og:image" content="/banner.png" />
        <meta name="twitter:image" content="/banner.png" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/toss/tossface/dist/tossface.css" />
        <link rel="icon" href="/favicon.ico" />
        <style>{`@import url('https://cdn.jsdelivr.net/gh/toss/tossface/dist/tossface.css');`}</style>
        <style>{`.tossface {  font-family: "Tossface", sans-serif; }`}</style>
        <script async src={GA_SRC} />
        <script>{gaScript}</script>
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider search={{ SearchDialog }}>{children}</RootProvider>
      </body>
    </html>
  );
}
