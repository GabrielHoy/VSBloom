# Changelog

All notable changes to the VS: Bloom project will be documented in this file.


## [1.0.1] - 2026-02-06

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