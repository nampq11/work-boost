import { Copy, Minus, Rectangle, X } from '@phosphor-icons/react';
import React, { useEffect, useState } from 'react';

/**
 * Custom window controls for the frameless Tauri window.
 *
 * Rendering is guarded so the app keeps working in a browser/sidecar pipeline: outside Tauri
 * `getCurrentWindow()` would throw, so we bail to `null` and the header simply renders without
 * min/max/close buttons.
 */
export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    // Lazily import so the browser bundle doesn't pull Tauri's window API.
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      const sync = async () => {
        try {
          setIsMaximized(await appWindow.isMaximized());
        } catch {
          // Permissions or not-yet-ready window: leave the last known state.
        }
      };
      await sync();
      unlisten = await appWindow.onResized(sync);
    });
    return () => unlisten?.();
  }, [isTauri]);

  if (!isTauri) return null;

  const minimize = () =>
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow().minimize(),
    );
  const toggleMaximize = () =>
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow().toggleMaximize(),
    );
  const close = () =>
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow().close(),
    );

  return (
    <div className="flex items-stretch h-full -mr-3.5">
      <button
        type="button"
        onClick={minimize}
        className="w-11 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors focus-visible:outline-none"
        aria-label="Minimize"
        title="Minimize"
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        onClick={toggleMaximize}
        className="w-11 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors focus-visible:outline-none"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? <Copy size={14} /> : <Rectangle size={13} />}
      </button>
      <button
        type="button"
        onClick={close}
        className="w-11 flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-[var(--accent-red)] transition-colors focus-visible:outline-none"
        aria-label="Close"
        title="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
