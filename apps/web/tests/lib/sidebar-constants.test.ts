/// <reference lib="deno.ns" />
import { assert, assertEquals } from '@std/assert';
import {
  SIDEBAR_BASE_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  defaultSidebarWidth,
} from '../../src/lib/sidebar-constants.ts';

Deno.test('defaultSidebarWidth keeps the classic width on small windows', () => {
  assertEquals(defaultSidebarWidth(1280), SIDEBAR_BASE_WIDTH);
  assertEquals(defaultSidebarWidth(1024), SIDEBAR_BASE_WIDTH);
});

Deno.test('defaultSidebarWidth widens proportionally on large windows', () => {
  const fullscreen = defaultSidebarWidth(1920);
  assert(
    fullscreen > SIDEBAR_BASE_WIDTH,
    `1920px viewport should widen the sidebar beyond ${SIDEBAR_BASE_WIDTH}px`,
  );
  assert(fullscreen < defaultSidebarWidth(2560), 'wider viewports should get a wider sidebar');
});

Deno.test('defaultSidebarWidth stays within drag bounds', () => {
  assertEquals(defaultSidebarWidth(3840), SIDEBAR_MAX_WIDTH);
  assertEquals(defaultSidebarWidth(500), SIDEBAR_BASE_WIDTH);
  for (const viewport of [320, 800, 1280, 1920, 2560, 3440, 3840]) {
    const width = defaultSidebarWidth(viewport);
    assert(
      width >= SIDEBAR_MIN_WIDTH && width <= SIDEBAR_MAX_WIDTH,
      `${viewport}px viewport produced out-of-bounds width ${width}`,
    );
  }
});
