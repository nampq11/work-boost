import type { DataPort } from '../../src/lib/data-port.ts';
/// <reference lib="deno.ns" />
import { createWorkspaceStore } from '../../src/store/workspace-store.ts';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function createMockPort(): DataPort {
  return {
    listFiles: () => Promise.resolve([]),
    readFile: () => Promise.reject(new Error('not implemented')),
    writeFile: () => Promise.reject(new Error('not implemented')),
    createFile: () => Promise.reject(new Error('not implemented')),
    patchFile: () => Promise.reject(new Error('not implemented')),
    moveFile: () => Promise.reject(new Error('not implemented')),
    trashFile: () => Promise.reject(new Error('not implemented')),
    restoreFile: () => Promise.reject(new Error('not implemented')),
    createFolder: () => Promise.reject(new Error('not implemented')),
    subscribe: () => () => undefined,
    getDailyToday: () => Promise.reject(new Error('not implemented')),
    listDebts: () => Promise.reject(new Error('not implemented')),
    createDebt: () => Promise.reject(new Error('not implemented')),
    settleDebt: () => Promise.reject(new Error('not implemented')),
    createThread: () => Promise.reject(new Error('not implemented')),
    createResponse: () => Promise.reject(new Error('not implemented')),
    streamResponse: async function* () {},
    sendMessage: () => Promise.reject(new Error('not implemented')),
    getAuthStatus: () => Promise.reject(new Error('not implemented')),
    startAuthLogin: () => Promise.reject(new Error('not implemented')),
    subscribeAuthLogin: () => () => undefined,
    cancelAuthLogin: () => Promise.reject(new Error('not implemented')),
    submitLoginCode: () => Promise.reject(new Error('not implemented')),
    logoutAuth: () => Promise.reject(new Error('not implemented')),
    saveApiKey: () => Promise.reject(new Error('not implemented')),
    setAIConfig: () => Promise.reject(new Error('not implemented')),
    getSidecarStatus: () => 'browser',
    onSidecarStatusChange: () => () => undefined,
  };
}

Deno.test('goHome saves the active note before returning to the start page', async () => {
  const store = createWorkspaceStore(createMockPort());
  const initialState = store.getState();
  let wasSaved = false;

  try {
    store.setState({
      activePath: 'notes/weekly.md',
      activeDocument: {
        path: 'notes/weekly.md',
        frontmatter: {},
        body: 'Draft note',
        rawMarkdown: 'Draft note',
        size: 10,
        modifiedAt: '2026-08-21T00:00:00.000Z',
        isDirty: true,
      },
      draft: 'Draft note',
      isDirty: true,
      documentRevision: 4,
      error: 'Previous error',
      save: async () => {
        wasSaved = true;
        store.setState({ isDirty: false });
      },
    });

    const didReturnHome = await store.getState().goHome();
    const state = store.getState();

    assertEqual(wasSaved, true, 'Expected the draft to be saved');
    assertEqual(didReturnHome, true, 'Expected navigation to succeed');
    assertEqual(state.activePath, null, 'Expected no active file');
    assertEqual(state.activeDocument, null, 'Expected no active document');
    assertEqual(state.draft, '', 'Expected the draft to be cleared');
    assertEqual(state.isDirty, false, 'Expected the document to be clean');
    assertEqual(state.documentRevision, 5, 'Expected the document revision to advance');
    assertEqual(state.error, null, 'Expected the previous error to be cleared');
  } finally {
    store.setState(initialState, true);
  }
});
