// English (default) message catalog.
// Keys are flat dotted namespaces. `{{key}}` placeholders in values are filled
// by the `t()` function's params argument.
export const en = {
  // App shell
  'common.new': 'New',
  'app.name': 'Work Boost',

  // Main.tsx bootstrapping / connection states
  'app.connecting': 'Connecting to workspace...',
  'app.failedToConnect': 'Failed to connect to the workspace API.',

  // Empty-state dashboards and editor chrome
  'editor.recentNotes': 'Recent Notes',
  'editor.pickUpWhereYouLeftOff': 'Pick up where you left off',
  'editor.welcomeTitle': 'Welcome to Work Boost',
  'editor.welcomeSubtitle': 'Your personal workspace & productivity hub',
  'editor.newNote': 'New Note',
  'editor.newNoteDescription': 'Write daily notes or docs',
  'editor.newDebt': 'New Debt',
  'editor.newDebtDescription': 'Track lent or borrowed money',
  'editor.press': 'Press',
  'editor.toSearchAnything': 'to search anything',
  'editor.viewMode': 'View mode',
  'editor.previewTab': 'Preview',
  'editor.sourceTab': 'Source',
  // Settings menu
  'settings.title': 'Settings',
  'settings.autosave': 'Auto-save',
  'settings.autosaveHint': 'Save automatically as you type',
  'settings.saveShortcut': 'Cmd/Ctrl+S to save manually',
  'editor.justNow': 'Just now',
  'editor.minutesAgo': '{{count}}m ago',
  'editor.hoursAgo': '{{count}}h ago',
  'editor.daysAgo': '{{count}}d ago',

  // Today view (daily capture front door)
  'editor.todayTitle': 'Today',
  'editor.todayPrompt': 'What did you do today? Work, money, anything.',
  'editor.todayPromptHint': 'Enter to capture, Shift+Enter for a new line.',
  'editor.todayCaptureSending': 'Capturing your day...',
  'editor.todayCaptureAction': 'Capture',
  'editor.todayCaptureFailed': 'Unable to capture. Check the connection and try again.',
  'editor.todaySummaryTitle': 'Today\u2019s summary',
  'editor.todaySummaryEmpty':
    'Nothing captured yet. Dump your day above and the AI organizes it here.',
  'editor.todayCopyMarkdown': 'Copy Markdown',
  'editor.todayCopyMarkdownDone': 'Report copied to clipboard.',
  'editor.todayCopyMarkdownFailed': 'Unable to copy the report.',
  'editor.todayCompletedTitle': 'Done',
  'editor.todayIncompleteTitle': 'Incomplete',
  'editor.todayPlannedTitle': 'Planned',
  'editor.todayDebtsTitle': 'Today\u2019s debts',
  'editor.todayDebtsEmpty': 'No active debts.',
  'editor.todayLoadFailed': 'Could not load today\u2019s data.',
  'editor.todayRetry': 'Retry',

  // Debt frontmatter inspector
  'frontmatter.debtProperties': 'Debt Properties',
  'frontmatter.person': 'Person',
  'frontmatter.amount': 'Amount',
  'frontmatter.currency': 'Currency',
  'frontmatter.status': 'Status',
  'frontmatter.direction': 'Direction',
  'frontmatter.date': 'Date',
  'frontmatter.statusPending': 'Pending',
  'frontmatter.statusPaid': 'Paid',
  'frontmatter.statusCancelled': 'Cancelled',
  'frontmatter.directionLent': 'Lent',
  'frontmatter.directionBorrowed': 'Borrowed',

  // Command palette
  'commandPalette.placeholder': 'Type a command or search files...',
  'commandPalette.createDaily': 'Create daily note',
  'commandPalette.today': 'Today',
  'commandPalette.createDebt': 'Create debt',
  'commandPalette.openForm': 'Open form',
  'commandPalette.personNamePrompt': 'Person name',
  'commandPalette.amountPrompt': 'Amount',
  'commandPalette.unableCreateDaily': 'Unable to create daily note',
  'commandPalette.unableCreateDebt': 'Unable to create debt',

  // Header / status / sidebar / window chrome
  'header.returnToStart': 'Return to start page',
  'header.toggleTheme': 'Toggle theme',
  'header.copilot': 'Copilot',
  'statusBar.markdown': 'Markdown',
  'sidebar.searchNotes': 'Search notes...',
  'sidebar.newFolder': 'New folder',
  'sidebar.refresh': 'Refresh workspace',
  'sidebar.folderName': 'Folder name...',
  'sidebar.workspace': 'Workspace',
  'sidebar.today': 'Today',
  'statusBar.words': '{{count}} words',
  'statusBar.chars': '({{count}} chars)',
  'statusBar.unsaved': '● Unsaved changes',
  'statusBar.savedAt': 'Saved at {{time}}',
  'statusBar.ready': 'Ready',
  'windowControls.minimize': 'Minimize',
  'windowControls.maximize': 'Maximize',
  'windowControls.restore': 'Restore',
  'windowControls.close': 'Close',

  // Tiptap editor toolbar
  'tiptap.loading': 'Loading editor...',
  'tiptap.heading1': 'Heading 1',
  'tiptap.heading2': 'Heading 2',
  'tiptap.bold': 'Bold (Ctrl+B)',
  'tiptap.italic': 'Italic (Ctrl+I)',
  'tiptap.taskList': 'Task List',
  'tiptap.bulletList': 'Bullet List',
  'tiptap.quote': 'Quote',
  'tiptap.codeBlock': 'Code Block',

  // Source editor
  'sourceEditor.aria': 'Raw markdown source',

  // Copilot / assistant thread
  'copilot.workspace': 'Copilot Workspace',
  'copilot.auth.checkingConnection': 'Checking provider connection...',
  'copilot.auth.retry': 'Retry',
  'copilot.auth.noBrowserLogin': 'This provider does not support browser login.',
  'copilot.auth.openVerificationPage': 'Open the verification page and enter this code',
  'copilot.auth.openVerificationPageLink': 'Open verification page',
  'copilot.auth.openAuthorizationLink': 'Open authorization link',
  'copilot.auth.cancel': 'Cancel',
  'copilot.auth.connectFromDrawer':
    'Connect from this drawer. Your credentials stay on the Work Boost API server.',
  'copilot.auth.refreshFailed': 'The saved login could not be refreshed. Reconnect to continue.',
  'copilot.auth.reconnectOpenAICodex': 'Reconnect OpenAI Codex',
  'copilot.auth.connectOpenAICodex': 'Connect OpenAI Codex',
  'copilot.auth.unableCopyCode': 'Unable to copy the verification code.',
  'copilot.auth.waitingForAuthorization': 'Waiting for authorization...',
  'copilot.auth.openLinkBelow': 'Open the link below to authorize...',
  'copilot.auth.unableOpenBrowser': 'Unable to open the browser.',
  'copilot.auth.loginCancelled': 'Login cancelled.',
  'copilot.auth.startingLogin': 'Starting secure login...',
  'copilot.auth.progressInterrupted': 'The login progress connection was interrupted.',
  'copilot.auth.unableCancelLogin': 'Unable to cancel login.',
  'copilot.auth.providerUnavailable': 'The AI provider is unavailable.',
  'thread.copyResponse': 'Copy response',
  'thread.messagePlaceholder': 'Message Work Boost...',
  'thread.cancelRequest': 'Cancel request',
  'thread.sendMessage': 'Send message',
  'thread.assistantFailed': 'The assistant failed.',
  'thread.welcomeTitle': 'How can I help you today?',
  'thread.welcomeSubtitle': 'Summarize notes, query daily tasks, or record debt entries.',
  'auth.copyVerificationCode': 'Copy verification code',
  'tool.failed': 'Tool failed',
  'tool.completed': 'Tool completed',
  'tool.request': 'Request',
  'tool.result': 'Result',
  'tool.waiting': 'Waiting for the tool to finish...',
  'tool.queryDefault': 'workspace',
  'messagePair.thinking': 'Thinking',

  // Toast
  'toast.close': 'Close',
  'toast.dismiss': 'Dismiss',
  'toast.movedToTrash': 'Moved {{path}} to trash.',
  'toast.undo': 'Undo',
  'toast.unableRestore': 'Unable to restore file.',
  'toast.unableMoveToTrash': 'Unable to move file to trash.',

  // Workspace store
  'workspace.fileChangedOutside':
    'File changed outside the editor. Reload it or keep your local draft.',
  'workspace.saveFailed': 'Save failed',
} as const;

export type MessageKey = keyof typeof en;
