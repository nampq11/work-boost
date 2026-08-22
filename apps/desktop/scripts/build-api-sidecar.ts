#!/usr/bin/env -S deno run --allow-all --allow-read --allow-write --allow-run --allow-env
//
// Compile the Deno API into a single self-contained Tauri sidecar binary.
//
// Output: apps/desktop/src-tauri/binaries/workboost-api-<host-target-triple>
// (the `-<triple>` suffix is required by Tauri's externalBin convention).
//
// Flags:
//   --unstable-cron keeps the API's Deno.cron scheduler (extensions/manager.ts registerAllCronJobs).
//     The catch-all `--unstable` is deprecated in Deno 2.0 and does NOT enable cron, so it must not be
//     used here. `--unstable-kv` is intentionally omitted: Deno #21814 makes `Deno.openKv` unavailable
//     in binaries compiled with it, and production never opens KV (only the test path does).
//   --include embeds the runtime's non-code assets (HTML apps + broker JS/CSS). `deno compile` only
//     bundles code modules by default, and packages/runtime reads these files from disk at startup
//     (seedHtmlApps/readBrokerRuntime), so without --include the sidecar fails immediately.
//   Compiles against a generated isolated config (see writeIsolatedCompileConfig): compiling with
//     the root workspace config makes `deno compile` embed ~450MB of unrelated workspace npm
//     packages (web UI libs, dev tools) into the sidecar.
//   No `--env-file` is passed; provider secrets come from the shell env or a user-level
//     `~/.workboost/.env` at runtime, never from the repo bundle.

import { dirname, fromFileUrl, join } from '@std/path';

// fromFileUrl (not URL().pathname) so Windows drive-letter paths ("file:///C:/...") resolve correctly.
const scriptDir = dirname(fromFileUrl(import.meta.url));
const desktopDir = join(scriptDir, '..');
// Two levels up from apps/desktop so import-map paths ("./packages/...") and the compile entry
// ("apps/api/src/main.ts") resolve against the monorepo root.
const repoRoot = join(desktopDir, '..', '..');

const hostTriple = await getHostTriple();
const outputDir = join(desktopDir, 'src-tauri', 'binaries');
const outputName = `workboost-api-${hostTriple}`;
const outputPath = join(outputDir, outputName);
// --force CLI flag (not FORCE=1 env prefix) so `npm run build` works in Windows cmd.exe.
const force = Deno.args.includes('--force') || Deno.env.get('FORCE') === '1';

async function getHostTriple(): Promise<string> {
  const command = new Deno.Command('rustc', {
    args: ['--print', 'host-tuple'],
    stdout: 'piped',
  });
  const { success, stdout } = await command.output();
  if (!success) {
    throw new Error('Failed to get host triple from rustc');
  }
  return new TextDecoder().decode(stdout).trim();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

// Dev-only tooling mapped in the root import map; never imported by apps/api and each pulls in
// tens of MB of native binaries when embedded.
const DEV_ONLY_IMPORTS = new Set(['@biomejs/biome', 'oxlint']);

// `deno compile` resolves import-map paths relative to the config file location, so the isolated
// config must live in the repo root for the @work-boost/* member paths to keep working. Caller
// deletes the file after compilation.
async function writeIsolatedCompileConfig(): Promise<string> {
  const rootConfig = JSON.parse(await Deno.readTextFile(join(repoRoot, 'deno.json')));
  // Dropping "workspace" is what stops `deno compile` from packing every workspace member's npm
  // packages into the binary; the remaining fields keep module resolution identical to dev.
  for (const key of ['workspace', 'fmt', 'lint', 'deploy', 'tasks', 'allowScripts']) {
    delete rootConfig[key];
  }
  rootConfig.imports = Object.fromEntries(
    Object.entries(rootConfig.imports ?? {}).filter(([name]) => !DEV_ONLY_IMPORTS.has(name)),
  );
  rootConfig.nodeModulesDir = 'none';
  const configPath = join(repoRoot, '.api-compile.tmp.json');
  await Deno.writeTextFile(configPath, JSON.stringify(rootConfig, null, 2));
  return configPath;
}

async function main() {
  if (!force && (await fileExists(outputPath))) {
    console.log(
      `[build-api-sidecar] ${outputPath} already exists; skipping (FORCE=1 to recompile).`,
    );
    return;
  }

  await Deno.mkdir(outputDir, { recursive: true });

  console.log(`[build-api-sidecar] Compiling apps/api -> ${outputPath}`);

  const configPath = await writeIsolatedCompileConfig();

  try {
    // Run deno compile from repo root
    const command = new Deno.Command('deno', {
      args: [
        'compile',
        '--allow-all',
        '--unstable-cron',
        '--no-check',
        // Resolve npm packages from the global Deno cache instead of the shared root
        // node_modules, so only the API's graph can end up in the binary. Requires deps to be
        // cached (`deno install` in CI) since no local node_modules is consulted.
        '--node-modules-dir=none',
        '--config',
        configPath,
        '--include',
        'packages/runtime/src/global.js',
        '--include',
        'packages/runtime/src/theme.css',
        '--include',
        'packages/runtime/src/apps/debt-tracker.html',
        '--include',
        'packages/runtime/src/apps/standup-viewer.html',
        '--output',
        outputPath,
        'apps/api/src/main.ts',
      ],
      cwd: repoRoot,
      stdout: 'inherit',
      stderr: 'inherit',
    });

    const { success } = await command.output();

    if (!success) {
      throw new Error(`[build-api-sidecar] Compilation failed`);
    }
  } finally {
    await Deno.remove(configPath).catch(() => {});
  }

  console.log(`[build-api-sidecar] Done: ${outputPath}`);
}

await main();
