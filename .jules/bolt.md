## 2024-05-24 - Prevent O(N) re-renders in SidebarTree
**Learning:** Selecting global primitive values like `activePath` in a tree component causes all nodes to re-render when the value changes.
**Action:** Use a derived boolean selector like `state.activePath === node.path` to ensure only the nodes changing state re-render.
