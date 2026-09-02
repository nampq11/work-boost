## 2024-05-18 - Zustand Selector Optimization in Lists
**Learning:** When using Zustand in list components (like `TreeNode`), avoid selectors that return global primitive values (e.g., `state.activePath`). These cause all rendered components to re-render when the global changes.
**Action:** Instead, use derived boolean selectors inside the selector callback (e.g., `state.activePath === node.path`) to ensure only the components whose active status changes re-render.
