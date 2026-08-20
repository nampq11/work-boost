import { create } from 'zustand';
import { ApiError, api } from '../lib/api-client.ts';
import { stringifyMarkdown } from '../lib/markdown-parser.ts';
import type { ActiveDocument, FileNode, SyncStatus, WorkspaceEvent } from '../lib/types.ts';

interface WorkspaceState {
  nodes: FileNode[];
  activePath: string | null;
  activeDocument: ActiveDocument | null;
  isLoading: boolean;
  syncStatus: SyncStatus;
  error: string | null;
  draft: string;
  isDirty: boolean;
  documentRevision: number;
  loadFiles: () => Promise<void>;
  selectFile: (path: string, force?: boolean) => Promise<boolean>;
  updateBody: (body: string) => void;
  updateFrontmatter: (frontmatter: Record<string, unknown>) => void;
  save: () => Promise<void>;
  handleEvent: (event: WorkspaceEvent) => Promise<void>;
  trash: (path: string) => Promise<{ trashId: string; originalPath: string }>;
  restore: (trashId: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
}

function classify(path: string): FileNode['kind'] {
  if (path.toLowerCase().endsWith('.html')) return 'html-app';
  if (path.startsWith('daily/')) return 'daily';
  if (path.startsWith('debts/archive/')) return 'debt-archive';
  if (path.startsWith('debts/')) return 'debt';
  return 'markdown';
}

export function buildFileTree(paths: string[], directories: string[] = []): FileNode[] {
  const root: FileNode[] = [];
  const folders = new Map<string, FileNode>();
  const ensureFolder = (path: string): FileNode => {
    const existing = folders.get(path);
    if (existing) return existing;
    const parts = path.split('/');
    const parentPath = parts.slice(0, -1).join('/');
    const parentChildren = parentPath ? ensureFolder(parentPath).children! : root;
    const folder: FileNode = {
      path,
      relativePath: path,
      name: parts.at(-1)!,
      kind: 'folder',
      children: [],
    };
    folders.set(path, folder);
    parentChildren.push(folder);
    return folder;
  };
  for (const directory of ['daily', 'debts', 'debts/archive', ...directories].filter(Boolean))
    ensureFolder(directory);
  for (const path of paths.filter(Boolean).sort()) {
    const parts = path.split('/');
    const parent = parts.slice(0, -1).join('/');
    const children = parent ? ensureFolder(parent).children! : root;
    children.push({
      path,
      relativePath: path,
      name: parts.at(-1)!,
      kind: classify(path),
      isArchived: path.startsWith('debts/archive/'),
    });
  }
  return root;
}

function draftKey(path: string): string {
  return `workboost:draft:${path}`;
}
interface DraftCache {
  body: string;
  frontmatter?: Record<string, unknown>;
}

function getDraft(path: string): DraftCache | null {
  try {
    const value = localStorage.getItem(draftKey(path));
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && 'body' in parsed) {
      const draft = parsed as { body?: unknown; frontmatter?: unknown };
      if (typeof draft.body === 'string') {
        return {
          body: draft.body,
          frontmatter:
            typeof draft.frontmatter === 'object' && draft.frontmatter !== null
              ? (draft.frontmatter as Record<string, unknown>)
              : {},
        };
      }
    }
    return { body: value };
  } catch {
    return null;
  }
}
function setDraft(path: string, value: DraftCache): void {
  try {
    localStorage.setItem(draftKey(path), JSON.stringify(value));
  } catch {
    /* storage is optional */
  }
}
function flattenFilePaths(nodes: FileNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'folder' ? flattenFilePaths(node.children ?? []) : [node.path],
  );
}

function clearDraft(path: string): void {
  try {
    localStorage.removeItem(draftKey(path));
  } catch {
    /* storage is optional */
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  nodes: [],
  activePath: null,
  activeDocument: null,
  isLoading: false,
  syncStatus: 'reconnecting',
  error: null,
  draft: '',
  isDirty: false,
  documentRevision: 0,
  async loadFiles() {
    set({ isLoading: true, error: null });
    try {
      set({
        nodes: buildFileTree(await api.listFiles()),
        isLoading: false,
        syncStatus: 'connected',
      });
    } catch (error) {
      set({
        isLoading: false,
        syncStatus: 'offline',
        error: error instanceof Error ? error.message : 'Unable to load workspace',
      });
    }
  },
  async selectFile(path, force = false) {
    const state = get();
    const previousPath = state.activePath;
    if (state.isDirty && !force) await state.save();
    if (!force && get().activePath !== previousPath) return false;
    if (path.toLowerCase().endsWith('.html')) {
      set((current) => ({
        activePath: path,
        activeDocument: null,
        draft: '',
        isDirty: false,
        documentRevision: current.documentRevision + 1,
      }));
      return true;
    }
    try {
      const document = await api.readFile(path);
      const raw = stringifyMarkdown(document.frontmatter, document.body);
      const cachedDraft = getDraft(path);
      const frontmatter = cachedDraft?.frontmatter ?? document.frontmatter;
      set((current) => ({
        activePath: path,
        activeDocument: {
          ...document,
          frontmatter,
          rawMarkdown: raw,
          isDirty: Boolean(cachedDraft),
          lastSavedAt: new Date(document.modifiedAt),
        },
        draft: cachedDraft?.body ?? document.body,
        isDirty: Boolean(cachedDraft),
        documentRevision: current.documentRevision + 1,
        error: null,
      }));
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unable to read file' });
      return false;
    }
  },
  updateBody(body) {
    const { activeDocument, activePath } = get();
    if (!activeDocument || !activePath) return;
    setDraft(activePath, { body, frontmatter: activeDocument.frontmatter });
    set((current) => ({
      draft: body,
      isDirty: true,
      documentRevision: current.documentRevision + 1,
      activeDocument: { ...activeDocument, body, isDirty: true },
    }));
  },
  updateFrontmatter(frontmatter) {
    const { activeDocument, activePath, draft } = get();
    if (!activeDocument || !activePath) return;
    setDraft(activePath, { body: draft, frontmatter });
    set((current) => ({
      activeDocument: { ...activeDocument, frontmatter, isDirty: true },
      isDirty: true,
      documentRevision: current.documentRevision + 1,
    }));
  },
  async save() {
    const { activeDocument, activePath, draft, documentRevision } = get();
    if (!activeDocument || !activePath || !get().isDirty) return;
    const savePath = activePath;
    const saveRevision = documentRevision;
    const saveDocument = activeDocument;
    const saveDraft = draft;
    set({ syncStatus: 'saving' });
    try {
      const saved = await api.patchFile(
        savePath,
        { body: saveDraft, frontmatter: saveDocument.frontmatter },
        saveDocument.modifiedAt,
      );
      const current = get();
      if (current.activePath !== savePath || current.documentRevision !== saveRevision) return;
      clearDraft(savePath);
      set({
        activeDocument: {
          ...saved,
          rawMarkdown: stringifyMarkdown(saved.frontmatter, saved.body),
          isDirty: false,
          lastSavedAt: new Date(),
        },
        draft: saved.body,
        isDirty: false,
        syncStatus: 'connected',
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof ApiError && error.code === 'CONFLICT'
          ? 'File changed outside the editor. Reload it or keep your local draft.'
          : error instanceof Error
            ? error.message
            : 'Save failed';
      if (get().activePath === savePath) set({ syncStatus: 'offline', error: message });
      throw error;
    }
  },
  async handleEvent(event) {
    await get().loadFiles();
    const current = get();
    const activePath = current.activePath;
    const changed = activePath !== null && event.paths.some((path) => path === activePath);
    if (!changed || activePath.toLowerCase().endsWith('.html')) return;
    if (current.isDirty) {
      set({ error: 'This file changed on disk while you were editing.' });
      return;
    }
    await current.selectFile(activePath, true);
  },
  async trash(path) {
    const result = await api.trashFile(path);
    if (get().activePath === path) {
      set({ activePath: null, activeDocument: null, draft: '', isDirty: false });
    }
    await get().loadFiles();
    return result;
  },
  async restore(trashId) {
    await api.restoreFile(trashId);
    await get().loadFiles();
  },
  async createFolder(path) {
    await api.createFolder(path);
    set({ nodes: buildFileTree(flattenFilePaths(get().nodes), [path]) });
  },
}));
