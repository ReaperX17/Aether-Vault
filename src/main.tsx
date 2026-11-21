import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Automatically attach active Session Token (X-Auth-Token) and User Profile ID (X-User-Id) to all /api/* requests
if (typeof window !== 'undefined' && !(window as any).__aethervaultFetchWrapped) {
  (window as any).__aethervaultFetchWrapped = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
      const activeUserId = localStorage.getItem('aethervault_active_user_id') || '1';
      const authToken = localStorage.getItem('aethervault_auth_token') || '';
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('X-User-Id')) {
        headers.set('X-User-Id', activeUserId);
      }
      if (authToken && !headers.has('X-Auth-Token')) {
        headers.set('X-Auth-Token', authToken);
      }
      return nativeFetch(input, { ...init, headers, credentials: init?.credentials || 'same-origin' });
    }
    return nativeFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

