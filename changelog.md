<!-- markdownlint-disable-file-->

# Changelog

All notable changes to the VS: Bloom project will be documented in this file.

## [1.4.0] - 2026-03-07

### Fixed
- Refactored the "Client Corruption Warning Suppression" setting, some people on the newest VSCode update got softlocked from the way it previously patched the client; this will never happen again now due to the inclusion of a JS parser in the patching process - If the corruption suppression attempts to "patch" the client with invalid JS in the future, it will fail and complain to the user instead of catastrophically crashing VSCode etc.

### Added
- New user-facing configs for the **Tab Overhaul** effect: ***Tab Separator Style*** and ***Active Tab Glow Size***
- New user-facing configs for the **Quick-Input Overhaul** effect: ***Widget Border Width*** and ***Initial Widget Rotation***
- **<u>VSBloom Menu</u>** — a dedicated *Svelte*-based **Webview Panel** providing a *much* nicer experience for browsing and tweaking all of VSBloom's configurations compared to the default VS Code settings list (in my opinion at least), accessible via the `VSBloom: Open Menu` command
- **Settings Editor** page within the VSBloom Menu, supporting interactive controls for all setting types including color pickers, number sliders with step controls & unit displays, enum selectors, etc. Currently only supports User-level configurations, though the backend is built with the intention for this to change in the future...
- **Status Bar Entry** with a custom-built VSBloom glyph rendered in the VS Code Status Bar (...this was a surprisingly deep rabbit hole to do haha!), clicking it opens the VSBloom Menu — can be entirely toggled on/off via the `vsbloom.statusBarIcon.enabled` setting of course, if you prefer the status bar to stay clear
- **New Commands**: `VSBloom: Open Menu` and `VSBloom: Open Settings Editor` for quick access to the VSBloom Menu and a shortcut into its settings page respectively
- **Command Enablement Clauses** so the commands added by VS: Bloom only appear in the Command Palette when they're *actually* valid (e.g. "Enable" only shows when the client isn't already patched, "Open Menu" hides when it's already open, etc.)
- A README note & checkbox at the top of VSBloom's section in the default VS Code settings view that takes users directly to the VSBloom Menu's Settings Editor when checked, to avoid people having a moment
of "what am i looking at???" when seeing 400 config entries eventually under the VSBloom section in VS Code

### Internal Overhauls
- Attempted standardization of code formatting and practices around the codebase with the addition of **Biome** and **Prettier** configurations, along with performing spellcheck passes with the hope of
making the project more scalable in the future as well as being friendly to outside contributors etc.
- <u>Massive</u> internal **codebase refactoring**, including compartmentalization of all areas of the extension's logic into dedicated directories with individual modules for version tracking/extension reflection/status bar icon management/the webview panel/patching/etc.
- Completely rewrote the **ESBuild Bundler** to convert it from JavaScript to strictly-typed TypeScript; new bundler, package builder, and an automated glyph builder for automation of custom font glyph compilation from PNG&SVG sources without needing to fuss with low-level OpenType .WOFF/.TTF file internals in the future
- Internal **JSON Schemas** for Effect Configuration files, Effect Config Ordering file, the Extension Glyph Configuration, etc. - all leading into dynamic/automatic population of package manifests and font compilation, to allow for faster effect creation velocity in the future without the fuss of configuring effect settings and exposing user configurations etc.
- Effect configuration files migrated from `.json` to **JSONC** format with new metadata properties like `step`, `cssUnit`, `isColor`, and `settingsEditorDisplayName` to power the Settings Editor with the configuration property metadata and reflection necessary to drive its features
- Automated Effect Config population & CSS Variable forwarding support — Internal Effect JSONC configs are now automatically pulled into both the extension's `package.json` and forwarded as CSS variables into the Electron Renderer without needing tons of boilerplate TS code anymore to do so; helps hasten effect development velocity same as above schemas



## [1.3.0] - 2026-02-14

### Added
- **New Effect** to make various **interactables** much more dynamic and responsive around the app
- **New Effect** to overhaul **Editor Tabs**, adding many animations&state transitions to tabs
- **New Effect** to overhaul the **Quick-Input Menu**, providing a more cinematic and "front&center" design

## [1.2.0] - 2026-02-09

### Added
- New effect for the Active Line Number within code editor windows changing


## [1.1.0] - 2026-02-06

### Fixed
- The Window Focus Effects will now properly keep the window in focus when clicking into iframes, such as other extensions' web views.

### Added
- A plethora more configs for the Window Focus effects are now exposed to the user.
- Revamped the Window Focus Effect filters and tweaked initial values for them to look prettier.







## [1.0.0] - 2026-02-05
Initial release of VSBloom - Hello, World!
We're not very large right now with only 2 available effects, but some hopefully solid foundations are built out to really work some magic soon.


### Added
- Cursor Trails effect with "Solid" and "Disconnected" trail types and various configurations
- Window Focus Effect with configurable threshold for short->long effect transition
- General toggle for Anti-Aliasing, applicable currently only for Solid Cursor Trails but will also apply to future effects that make use of Pixi.JS Canvas objects
- Dynamic "Effect" Loading based on CSS/JS bundles
- Effect Manager to maintain synchronization of effects on all "clients" from whichever VS Code window is the "master" window hosting the WebSocketServer
- Shared Libraries for Effects to reduce payload size sent through WebSockets
- Created an internal "Bloom" Shared Effect Library to act as an all-purpose utility library housing various things like config helpers, geometry helpers, VFX classes, DOM watchers, etc.
- Added GSAP as a Shared Effect Library
- Added Motion as a Shared Effect Library *(unused for now, may remove later?)*
- Added Pixi.JS as a Shared Effect Library
- Added a README.md for a nice looking 'landing page' on the Visual Studio Marketplace / GitHub Repository
- Client script for connecting to the VSBloom Extension via a WebSocketServer and handling dynamic JS/CSS loading in the Electron DOM
- Checksum Synchronization for the VSCode Extension's `product.json` file
- Setting-Based Client Corruption Warning Suppression, enabled by default *(for now)*
- Extension Logo for nice user branding
- Automatic `package.json` file generation based on Effect configuration JSON
- Automated pipeline for requesting process elevation and performing client patching in an elevated context if required *(necessary if VS Code was installed system-wide for the user)*
- Client Patching is now functional

### Removed
- Removed Herobrine