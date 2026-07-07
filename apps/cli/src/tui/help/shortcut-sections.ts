export const SHORTCUT_SECTIONS = [
  {
    title: 'Editing',
    rows: [
      { key: 'enter', value: 'submit' },
      { key: 'shift+enter / alt+enter', value: 'newline (alt is a fallback for terminals that swallow shift+enter)' },
      { key: 'ctrl+u', value: 'delete to start of line' },
      { key: 'ctrl+w', value: 'delete previous word' },
      { key: 'alt+left / right', value: 'jump cursor to previous / next word' },
      { key: 'up / down', value: 'history (or move cursor in multi-line)' },
      { key: 'ctrl+f', value: 'search history (incremental reverse-search)' },
    ],
  },
  {
    title: 'Session',
    rows: [
      { key: 'ctrl+l', value: 'clear visible transcript' },
      { key: 'ctrl+r', value: 'expand / collapse last reasoning block' },
      { key: 'ctrl+o', value: 'expand / collapse last tool result' },
      { key: 'ctrl+e', value: 'explain pending command (in confirmation overlay)' },
      { key: 'shift+tab', value: 'cycle permission mode' },
      { key: 'esc', value: 'cancel running turn / clear buffer' },
      { key: 'ctrl+c', value: 'cancel turn / quit' },
      { key: 'ctrl+d', value: 'forward delete / quit on empty line' },
    ],
  },
  {
    title: 'Discovery',
    rows: [
      { key: '/', value: 'slash command picker' },
      { key: 'ctrl+k', value: 'command palette' },
      { key: '@', value: 'file path picker' },
      { key: '!', value: 'shell shortcut' },
      { key: '?', value: 'this help (when buffer is empty)' },
    ],
  },
] as const
