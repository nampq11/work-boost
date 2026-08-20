import React from 'react';
import { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/ui-store.ts';

export function HtmlAppViewer({ path }: { path: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const theme = useUiStore((state) => state.theme);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== 'WB_OPEN_EXTERNAL'
      ) {
        return;
      }
      try {
        const url = new URL(event.data.url);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          window.open(url.href, '_blank', 'noopener,noreferrer');
        }
      } catch {
        /* untrusted app message */
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'WB_THEME_CHANGE', theme }, '*');
  }, [theme]);
  return (
    <div className="app-viewer">
      <div className="viewer-heading">
        <span className="eyebrow">HTML app</span>
        <h1>{path.split('/').pop()}</h1>
      </div>
      <iframe
        ref={frame}
        title={path}
        src={`/workspace-apps/${encodeURIComponent(path.split('/').pop() ?? path)}`}
        sandbox="allow-scripts allow-forms"
      />
    </div>
  );
}
