import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import Landing from './pages/Landing.tsx';
import AppShell from './components/AppShell.tsx';
import RouteError from './components/RouteError.tsx';

// Vite fires this when a lazily-loaded chunk 404s after a redeploy: reload once to pick up the new build.
window.addEventListener('vite:preloadError', () => {
  const key = 'takt:reloaded-at';
  if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) > 10_000) { sessionStorage.setItem(key, String(Date.now())); location.reload(); }
});

const Overview = lazy(() => import('./pages/app/Overview.tsx'));
const LinePage = lazy(() => import('./pages/app/Line.tsx'));
const LiveCell = lazy(() => import('./pages/app/Live.tsx'));
const Alerts = lazy(() => import('./pages/app/Alerts.tsx'));
const Edge = lazy(() => import('./pages/app/Edge.tsx'));

const wrap = (el: React.ReactNode) => <Suspense fallback={null}>{el}</Suspense>;

const router = createBrowserRouter([
  { path: '/', element: <Landing />, errorElement: <RouteError /> },
  {
    path: '/app',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: wrap(<Overview />) },
      { path: 'lines/:id', element: wrap(<LinePage />) },
      { path: 'live', element: wrap(<LiveCell />) },
      { path: 'alerts', element: wrap(<Alerts />) },
      { path: 'edge', element: wrap(<Edge />) },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
