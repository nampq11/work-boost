import React from 'react';
import { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/ui-store.ts';

type ImportMetaWithEnvironment = ImportMeta & {
  env?: { DEV?: boolean };
};

type HtmlAppViewerProps = {
  path: string;
};

function getWorkspaceAppOrigin(): string {
  const isDevelopment = (import.meta as ImportMetaWithEnvironment).env?.DEV;
  if (isDevelopment) {
    return `http://${window.location.hostname}:3001`;
  }
  return window.location.origin;
}

export function HtmlAppViewer({ path }: HtmlAppViewerProps): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null);
  const theme = useUiStore((state) => state.theme);
  const fileName = path.split('/').pop() ?? path;
  const appOrigin = getWorkspaceAppOrigin();

  function postThemeToFrame(): void {
    frame.current?.contentWindow?.postMessage({ type: 'WB_THEME_CHANGE', theme }, '*');
  }
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
    postThemeToFrame();
  }, [theme]);
  return (
    <div className="app-viewer">
      <div className="viewer-heading">
        <span className="eyebrow">HTML app</span>
        <h1>{fileName}</h1>
      </div>
      <iframe
        ref={frame}
        title={path}
        src={`${appOrigin}/workspace-apps/${encodeURIComponent(fileName)}`}
        sandbox="allow-scripts allow-forms"
        onLoad={postThemeToFrame}
      />
    </div>
  );
}
