import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Button, Logo } from './ui.tsx';

const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported/i;

/** Route error screen. A stale chunk after a redeploy is healed by one automatic reload. */
export default function RouteError() {
  const err = useRouteError();
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : String(err);
  const stale = STALE.test(msg);
  useEffect(() => {
    if (!stale) return;
    const key = 'takt:reloaded-at';
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last > 10_000) { sessionStorage.setItem(key, String(Date.now())); location.reload(); }
  }, [stale]);
  return (
    <div className="grid min-h-screen place-items-center bg-page px-6">
      <div className="max-w-md text-center">
        <Logo className="justify-center" />
        <h1 className="mt-8 text-[22px] font-semibold tracking-tight">{stale ? 'Takt was updated' : 'Something went wrong'}</h1>
        <p className="mt-2 text-[14px] text-ink-2">{stale ? 'A newer version of the console is available. Reloading…' : msg}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" onClick={() => location.reload()}><RotateCcw size={14} />Reload</Button>
          <Button to="/app">Go to console</Button>
        </div>
      </div>
    </div>
  );
}
