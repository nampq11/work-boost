## 2023-10-27 - Zustand Selectors in Tree Structures
**Learning:** Using Zustand selectors that return primitive globals (like `state.activePath`) inside components rendered in a list or tree causes an (N)$ re-render of all items when the global changes.
**Action:** Always return a derived boolean check inside the selector (e.g., `state.activePath === node.path`) to ensure only the components that change their status re-render.
