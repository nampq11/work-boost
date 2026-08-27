import { assertEquals } from '@std/assert';
import {
  parseMarkdown,
  stringifyMarkdown as serverStringify,
} from '@work-boost/data-provider/markdown/markdown-engine.ts';
import {
  parseFrontmatter,
  stringifyMarkdown as rendererStringify,
  stripFrontmatter,
} from '../../src/lib/markdown-parser.ts';

/**
 * Conformance suite for the two markdown parsers.
 *
 * The server parser (`markdown-engine.ts`) uses full YAML via @std/yaml. The renderer parser
 * (`markdown-parser.ts`) is a hand-rolled scalar-only parser. WorkBoost workspace files use flat
 * scalar frontmatter only, so both must produce identical output for every shape used in the
 * workspace. This suite asserts that invariant at CI time.
 *
 * Known divergences (documented, not asserted):
 * - Nested YAML structures (objects/arrays) are only supported by the server parser.
 * - Stringification differs: the server appends a trailing newline and uses YAML quoting rules;
 *   the renderer writes JSON.stringify for values outside its scalar regex. Round-trip equality
 *   is asserted per-parser for the scalar subset, and cross-parser equality for the workspace
 *   schema shapes.
 */

interface Fixture {
  name: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

// Every frontmatter shape used in the workspace schema (data-schemas): daily
// notes, debt notes, and generic notes. All fields are flat scalars. These MUST
// produce identical output on both parsers.
const WORKSPACE_FIXTURES: Fixture[] = [
  {
    name: 'daily note',
    frontmatter: {
      id: 'daily_2026-08-21',
      date: '2026-08-21',
      status: 'completed',
      updatedAt: '2026-08-21T00:00:00.000Z',
      updatedBy: 'user',
    },
    body: '### 1. What did I complete?\n- **INBOX**: Shipped the parser.',
  },
  {
    name: 'debt note with number and optional field',
    frontmatter: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      direction: 'lent',
      amount: 100,
      currency: 'USD',
      personName: 'Alice',
      status: 'pending',
      debtDate: '2026-08-21',
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:00.000Z',
      paidAt: null,
    },
    body: 'Lent Alice 100 USD for the trip.',
  },
  {
    name: 'debt note without optional fields',
    frontmatter: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      direction: 'borrowed',
      amount: 50.5,
      currency: 'EUR',
      personName: 'Bob',
      status: 'pending',
      debtDate: '2026-08-20',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
    body: 'Borrowed 50.5 EUR from Bob.',
  },
  {
    name: 'generic note with boolean and empty string',
    frontmatter: {
      title: 'Meeting notes',
      archived: false,
      tags: '',
    },
    body: 'Talked about the release.',
  },
  {
    name: 'empty frontmatter',
    frontmatter: {},
    body: 'Just a body.',
  },
];

function rendererRoundTrip(
  frontmatter: Record<string, unknown>,
  body: string,
): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  return parseFrontmatter(rendererStringify(frontmatter, body));
}

function serverRoundTrip(
  frontmatter: Record<string, unknown>,
  body: string,
): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  return parseMarkdown<Record<string, unknown>>(serverStringify(frontmatter, body));
}

for (const fixture of WORKSPACE_FIXTURES) {
  Deno.test(`markdown conformance: renderer round-trips ${fixture.name}`, () => {
    const result = rendererRoundTrip(fixture.frontmatter, fixture.body);
    assertEquals(result.frontmatter, fixture.frontmatter);
    assertEquals(result.body, fixture.body);
  });

  Deno.test(`markdown conformance: server round-trips ${fixture.name}`, () => {
    const result = serverRoundTrip(fixture.frontmatter, fixture.body);
    assertEquals(result.frontmatter, fixture.frontmatter);
    assertEquals(result.body, fixture.body);
  });
}

Deno.test('markdown conformance: both parsers agree on workspace-schema frontmatter', () => {
  for (const fixture of WORKSPACE_FIXTURES) {
    const rendererParsed = rendererRoundTrip(fixture.frontmatter, fixture.body);
    const serverParsed = serverRoundTrip(fixture.frontmatter, fixture.body);
    // The renderer strips leading newlines after the closing `---`, the server
    // trims both ends; the body text must match after normalization.
    assertEquals(rendererParsed.frontmatter, serverParsed.frontmatter, fixture.name);
    assertEquals(rendererParsed.body.trim(), serverParsed.body.trim(), fixture.name);
  }
});

Deno.test('markdown conformance: stringify produces frontmatter-delimited documents', () => {
  for (const fixture of WORKSPACE_FIXTURES) {
    if (Object.keys(fixture.frontmatter).length === 0) continue;
    const rendererRaw = rendererStringify(fixture.frontmatter, fixture.body);
    const serverRaw = serverStringify(fixture.frontmatter, fixture.body);
    for (const raw of [rendererRaw, serverRaw]) {
      assertEquals(raw.startsWith('---\n'), true, `${fixture.name}: starts with ---`);
      assertEquals(raw.includes('\n---\n'), true, `${fixture.name}: has closing ---`);
    }
  }
});

// ---------------------------------------------------------------------------
// Malformed frontmatter degradation
// ---------------------------------------------------------------------------

/**
 * Raw documents whose frontmatter delimiters are well-formed but whose YAML is
 * invalid, so the server parser (full YAML) throws and its boundary
 * (`safeParseMarkdown` in workspace.ts) degrades to body-only.
 */
const MALFORMED_FIXTURES: { name: string; raw: string; body: string }[] = [
  {
    name: 'unclosed yaml flow sequence',
    raw: '---\nkey: [unclosed\n---\nbody text',
    body: 'body text',
  },
  {
    name: 'unclosed yaml flow mapping',
    raw: '---\nkey: {unclosed\n---\nbody text',
    body: 'body text',
  },
  {
    name: 'tab-indented yaml value',
    raw: '---\nkey:\n\tvalue\n---\nbody text',
    body: 'body text',
  },
];

/** Mirrors the server's `safeParseMarkdown` boundary (workspace.ts), minus logging. */
function serverSafeParse(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  try {
    return parseMarkdown<Record<string, unknown>>(raw);
  } catch {
    return { frontmatter: {}, body: stripFrontmatter(raw) };
  }
}

/** Mirrors the TauriDataPort `parseForPath` boundary for markdown files, minus logging. */
function rendererSafeParse(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  try {
    return parseFrontmatter(raw);
  } catch {
    return { frontmatter: {}, body: stripFrontmatter(raw) };
  }
}

Deno.test('markdown conformance: malformed fixtures do throw in the server parser', () => {
  // Guards against the fixtures silently becoming valid YAML.
  for (const fixture of MALFORMED_FIXTURES) {
    let threw = false;
    try {
      parseMarkdown<Record<string, unknown>>(fixture.raw);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, fixture.name);
  }
});

Deno.test('markdown conformance: server boundary degrades malformed frontmatter to body-only', () => {
  for (const fixture of MALFORMED_FIXTURES) {
    const parsed = serverSafeParse(fixture.raw);
    assertEquals(parsed.frontmatter, {}, fixture.name);
    assertEquals(parsed.body, fixture.body, fixture.name);
  }
});

Deno.test('markdown conformance: renderer boundary never leaks the frontmatter block into the body', () => {
  // The scalar-only renderer parser does not throw on invalid YAML (it reads the
  // broken value as a string - documented divergence), but its boundary must
  // produce the same body as the server's fallback so a corrupted file renders
  // identically in browser/HTTP and bundled-desktop builds.
  for (const fixture of MALFORMED_FIXTURES) {
    const parsed = rendererSafeParse(fixture.raw);
    assertEquals(parsed.body, fixture.body, fixture.name);
    assertEquals(parsed.body.includes('---'), false, fixture.name);
    assertEquals(typeof parsed.frontmatter, 'object', fixture.name);
  }
});

Deno.test('markdown conformance: stripFrontmatter matches the server fallback shape', () => {
  // Mirrors the server helper's behavior: no frontmatter -> trimmed raw;
  // closed block -> body after it; unterminated block -> trimmed raw.
  assertEquals(stripFrontmatter('plain body\n'), 'plain body');
  assertEquals(stripFrontmatter('---\nkey: 1\n---\n\nbody'), 'body');
  assertEquals(stripFrontmatter('---\nkey: 1\nunterminated'), '---\nkey: 1\nunterminated');
});
