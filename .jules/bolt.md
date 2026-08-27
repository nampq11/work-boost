## 2025-10-31 - Cache Intl.DateTimeFormat
**Learning:** \`new Intl.DateTimeFormat\` is very slow in Deno/V8 (taking ~111µs per call), compared to caching and reusing the formatter (~2µs).
**Action:** When a route or a tool formats times dynamically, cache \`Intl.DateTimeFormat\` objects by locale/timezone to avoid repeated allocation in hot paths.
