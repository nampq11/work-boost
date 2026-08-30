## 2024-06-25 - Prevented all tree nodes from re-rendering in SidebarTree
**Learning:** Returning a primitive string global value from a Zustand store inside a selector for a component mapped in a large list/tree will cause *all* rendered components to re-render.
**Action:** Return a derived boolean check within the selector when possible.
