import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { queryClient } from './lib/query';
import './styles.css';

const root = document.getElementById('root');

if (root == null) {
  throw new Error('Root element not found');
}

async function enableMocking() {
  if (!__ROLLIPOP_MOCK__) {
    return;
  }

  const { worker } = await import('./mocks/browser');

  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
    },
  });
}

void enableMocking().then(() => {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
