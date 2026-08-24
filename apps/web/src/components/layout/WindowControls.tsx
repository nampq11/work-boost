import { Copy, Minus, Rectangle, X } from '@phosphor-icons/react';
import React, { useEffect, useState } from 'react';
import { isTauri } from '../../lib/tauri.ts';

/**
 * Custom window controls for the frameless Tauri window.
 *
 * Rendering is guarded so the app keeps working in a browser/sidecar pipeline: outside Tauri
 * `getCurrentWindow()` would throw, so we bail to `null` and the header simply renders without
 * min/max/close buttons.
 */
export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    // Lazily import so the browser bundle doesn't pull Tauri's window API.
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      const sync = async () => {
        if (disposed) return;
        try {
          setIsMaximized(await appWindow.isMaximized());
        } catch {
          // Permissions or not-yet-ready window: leave the last known state.
        }
      };
      await sync();
      if (disposed) return;
      unlisten = await appWindow.onResized(sync);
      if (disposed) unlisten?.();
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isTauri()]);

  if (!isTauri()) return null;

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
        className="w-11 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)] transition-colors"
        aria-label="Minimize"
        title="Minimize"
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        onClick={toggleMaximize}
        className="w-11 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)] transition-colors"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? <Copy size={14} /> : <Rectangle size={13} />}
      </button>
      <button
        type="button"
        onClick={close}
        className="w-11 flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-[var(--accent-red)] focus-visible:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)] transition-colors"
        aria-label="Close"
        title="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
