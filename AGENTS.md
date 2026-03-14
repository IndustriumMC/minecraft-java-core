# AGENTS.md

## Purpose
This repo is the TypeScript core library used to authenticate users, prepare game files, install loaders, and spawn Minecraft Java. It is consumed by downstream launchers through the compiled package output, not directly from `src/`.

## What downstream consumers actually load
- `package.json` exports `require` to `build/Index.js` and `import` to `build/esm/Index.js`.
- There is no direct runtime entry to `src/`.
- Even when another repo links this repo locally, Node still resolves through the package exports and executes `build/` or `build/esm/`.
- That means source edits in `src/` do nothing for consumers until you run `npm run build`.
- `build/` and `build/esm/` are generated artifacts and must stay in sync with `src/`.

## Repo map
- `src/Index.ts`: public exports (`Launch`, `Microsoft`, `Mojang`, `AZauth`, `Status`, `Downloader`).
- `src/Launch.ts`: top-level launch orchestration and event relay.
- `src/Minecraft/`: version JSON, libraries, assets, Java runtime, logging, classpath/arguments, bundle cleanup.
- `src/Minecraft-Loader/`: built-in loader installers plus the fork-specific custom loader path.
- `src/Authenticator/`: Microsoft, Mojang, and AZauth flows plus Electron/NW/terminal helpers.
- `src/StatusServer/`: raw TCP server ping implementation.
- `src/utils/`: downloader, archive reader, library path helpers, mirror lookup.
- `assets/forge`: fallback Forge metadata.
- `assets/LWJGL`: ARM-specific LWJGL replacement manifests.
- `test/`: manual scripts, not an automated test suite.
- `webfiles/`: legacy sample backend/fileserver fixtures, not active runtime code for the package.

## Build and release model
- Build command: `npm run build`
- This runs TypeScript twice:
- CommonJS into `build/`
- ESM into `build/esm/`
- `prepare` also runs `npm run build`, so git installs rebuild automatically.
- Published package contents come from `assets/**`, `build/**`, `LICENSE`, and `README.md`.
- If you change runtime behavior in `src/`, downstream launchers will not see it until the compiled outputs are regenerated.

## Launch pipeline
`Launch.Launch()` is the real public entrypoint. The README still refers to `Launch.launch()`, but the code uses an uppercase method name.

High-level flow in `src/Launch.ts`:
- Merge defaults with user options.
- Resolve `path`, `mcp`, and loader config.
- Fetch the Mojang version manifest and target version JSON.
- Build the download bundle from:
- Minecraft libraries
- extra files from `options.url`
- assets
- logging config
- Java runtime files if no Java path was provided
- Download missing files.
- Install the selected loader if enabled.
- Optionally run `bundle.checkFiles(...)` when `verify` is true.
- Extract natives and copy legacy assets when needed.
- Build JVM args, game args, and classpath.
- Spawn Java and relay stdout/stderr through the `data` event.

## Important option semantics
- `path` is the shared Minecraft root.
- `instance` is a subdirectory under `path/instances/` used for game data like options, worlds, and resourcepacks. Shared files such as `libraries`, `assets`, `runtime`, and `versions` still live under the main root unless loader-specific code says otherwise.
- `url` is not just a manifest base URL in this fork. It is passed to `Minecraft-Libraries.GetAssetsOthers()` and is expected to return an array of extra downloadable files shaped like `{ path, hash, size, url }`.
- `ignored` is used for both hash checking and cleanup exclusion.
- `verify` is misleadingly named: it triggers file cleanup via `Minecraft-Bundle.checkFiles()`. It is not a full post-download integrity pass.
- `bypassOffline` injects fake Mojang service hosts into JVM args to bypass normal multiplayer auth hosts.

## Events and downstream expectations
- Main launch events are `progress`, `speed`, `estimated`, `extract`, `patch`, `data`, `close`, and `error`.
- `close` currently emits the literal string `'Minecraft closed'`, not the real process exit code.
- Downstream launchers must not assume a numeric close code from this library.
- Loader installer subprocess output, especially for the custom loader path, is forwarded through the `data` event.

## Loader subsystem
Supported loader types in code:
- `forge`
- `neoforge`
- `fabric`
- `legacyfabric`
- `quilt`
- `custom`

Built-in loader behavior:
- Fabric, LegacyFabric, and Quilt fetch a profile JSON and download missing libraries.
- Forge and NeoForge download installer jars, extract install profiles, extract embedded artifacts into `libraries/`, download required libraries, and run processor patchers.
- `src/Minecraft-Loader/patcher.ts` executes processor jars by reading `META-INF/MANIFEST.MF` for `Main-Class` and spawning Java with a constructed classpath.

## Fork-specific custom loader behavior
This fork has a first-class `custom` loader path. It is not documented correctly in the upstream-facing README, but it is part of the runtime contract.

Custom loader behavior:
- `loader.type = 'custom'` bypasses the built-in loader metadata table.
- `loader.customUrls.metaData` must return `{ versions: [...] }`.
- `loader.customUrls.install` must be a JAR URL template containing `${version}`.
- The installer is downloaded to `<mcRoot>/temp/custom-installer-<version>.jar`.
- The library computes `mcRoot` from the vanilla jar path, ensures `versions/` exists, and creates `launcher_profiles.json` if missing.
- It runs `java -jar installer.jar --installClient <mcRoot>`.
- Success detection now accepts either:
- a newly created version directory
- or an existing version JSON updated during the installer run
- This fork-specific fallback is required for installers that reuse an existing version folder instead of creating a new one.
- For custom loaders, library resolution is rooted at `<mcRoot>/libraries`, not `<loaderPath>/libraries`.

## NeoForge and Forge specifics
- Forge uses the Forge metadata endpoints, promotions, and installer/client/universal classifiers.
- If Forge metadata fetch fails, it falls back to `assets/forge/maven-metadata.json`.
- Forge verifies the downloaded installer with MD5 before using it.
- NeoForge supports more than plain releases in this fork:
- standard releases
- weekly snapshots like `25w14a`
- special weekly snapshot strings like `25w14craftmine`
- pre-releases like `1.21.5-pre1`
- release candidates like `1.21.5-rc1`
- new snapshot format like `26.1-snapshot-1`
- NeoForge switches between legacy and new APIs depending on version shape.

## Classpath and argument building
- `Minecraft-Arguments.ts` merges vanilla and loader arguments, replaces placeholders, and constructs the final `-cp` entry.
- The classpath builder dedupes library paths after merging loader and vanilla libraries.
- There is fork-specific handling around semver-based library selection to avoid duplicate or conflicting libraries.
- For custom loaders, `${library_directory}` points at `<mcRoot>/libraries`.
- For built-in loaders, loader libraries use `<loaderPath>/libraries`.
- Legacy assets are copied into `resources/` for older versions.
- macOS gets dock icon handling from the asset index when available.

## Java runtime handling
- If `options.java.path` is set, the library assumes Java is already present.
- Otherwise it tries Mojang's runtime manifest first.
- If Mojang metadata is unavailable or unsupported for the platform, it falls back to Azul Zulu ZIP downloads.
- ARM Linux version JSONs are rewritten through `Minecraft-Lwjgl-Native.ts`, which swaps in ARM-compatible LWJGL libraries from `assets/LWJGL/`.

## Auth subsystem
- Public auth surface is `Microsoft`, `Mojang`, and `AZauth`.
- `Microsoft` is an authorization-code flow using GUI helpers or a terminal copy/paste flow. It is not a device-code flow, even though the README says device code.
- Microsoft auth now includes:
- OAuth code exchange
- Xbox Live auth
- XSTS auth
- Minecraft login
- entitlement/license checks
- profile fetch with retries
- skin/cape base64 enrichment
- `Mojang` supports classic auth endpoints and also acts as an offline account generator when no password is passed.
- `AZauth` targets a Yggdrasil-compatible custom backend and also fetches the user skin as base64 when available.
- Electron and NW GUI helpers open a browser window and wait for the redirect URI. Terminal mode asks the user to paste back the redirected URL.

## Utilities and data handling
- `Downloader` uses `fetch`, emits aggregate progress/speed/ETA, and supports concurrent downloads.
- `Downloader` does not perform full post-download hash validation for every fetched file.
- Existing files are hash-checked before deciding whether to redownload them.
- `unzipper.ts` is a custom ZIP reader used instead of a third-party unzip library.
- `getFileFromArchive()` is a core helper used by loader installers, patchers, native extraction, and Java ZIP extraction.

## README drift and other footguns
- README says `Launch.launch()`, but the actual method is `Launch.Launch()`.
- README documents loader types up to Quilt, but code also supports `custom`.
- README describes `url` like a manifest base URL, but the fork uses it for extra downloadable files returned as JSON entries.
- README says Microsoft auth is device code, but the implementation is authorization code via embedded GUI or pasteback.
- Package metadata (`bugs`, `homepage`, `repository`) still points at upstream `luuxis`, not this fork.

## Testing reality
- There is no automated unit/integration test harness in `package.json`.
- `test/` contains manual runnable scripts for Microsoft auth, offline/Mojang auth, and AZauth flows.
- The most reliable regression check after source edits is:
- `npm run build`
- then exercise a real launcher or one of the manual scripts against the affected path

## Practical guidance for future edits
- Treat `src/` as the source of truth and `build/` plus `build/esm/` as generated outputs.
- Always rebuild after source edits before testing through a downstream launcher.
- If a linked launcher does not reflect a fix, check the compiled `build/` output first.
- If you touch `Launch.ts`, verify:
- option normalization
- event relay
- custom extra-file downloads from `url`
- the `close` event contract
- If you touch `Minecraft-Loader/` or `Minecraft-Arguments.ts`, verify both:
- built-in loaders
- the fork-specific custom loader path
- If you touch classpath logic, re-check duplicate library behavior and custom loader library roots.
- If you touch auth flows, test at least one real Microsoft login path plus the refresh path.
