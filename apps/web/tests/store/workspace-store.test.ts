/// <reference lib="deno.ns" />
import { useWorkspaceStore } from '../../src/store/workspace-store.ts';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

Deno.test('goHome saves the active note before returning to the start page', async () => {
  const initialState = useWorkspaceStore.getState();
  let wasSaved = false;

  try {
    useWorkspaceStore.setState({
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
        useWorkspaceStore.setState({ isDirty: false });
      },
    });

    const didReturnHome = await useWorkspaceStore.getState().goHome();
    const state = useWorkspaceStore.getState();

    assertEqual(wasSaved, true, 'Expected the draft to be saved');
    assertEqual(didReturnHome, true, 'Expected navigation to succeed');
    assertEqual(state.activePath, null, 'Expected no active file');
    assertEqual(state.activeDocument, null, 'Expected no active document');
    assertEqual(state.draft, '', 'Expected the draft to be cleared');
    assertEqual(state.isDirty, false, 'Expected the document to be clean');
    assertEqual(state.documentRevision, 5, 'Expected the document revision to advance');
    assertEqual(state.error, null, 'Expected the previous error to be cleared');
  } finally {
    useWorkspaceStore.setState(initialState, true);
  }
});
