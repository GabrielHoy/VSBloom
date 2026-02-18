<!--
	This file is the main entry point for the webview menu.
-->
<script lang="ts">
	import './CSS/Main.css';
	import { pageData } from "./Global/Pages.svelte";
	import Unknown from "./Components/Pages/Unknown.svelte";
	import { directories } from "./Global/Directories.svelte";
	import ScaleReflectionSingleton from "./Components/UX/ScaleReflectionSingleton.svelte";
	import MetadataDisplay from "./Components/MetadataDisplay.svelte";
	import { onDestroy } from "svelte";

	function InvertHexColor(hex: string): string {
		if (hex.startsWith('#')) {
			hex = hex.slice(1);
		}
		if (hex.length === 3) {
			hex = hex.split('').map(x => x + x).join('');
		}

		const num = parseInt(hex, 16);
		const r = 255 - ((num >> 16) & 0xff);
		const g = 255 - ((num >> 8) & 0xff);
		const b = 255 - (num & 0xff);

		return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
	}

	//it's rather stupid that *this* has to be done to just get
	//a hex color from a CSS variable, but I didn't make CSS3...:/
	function GetHexColorFromValidCSSColor(color: string): string {
		var temp = document.createElement("div");
		temp.style.color = color;
		document.body.appendChild(temp);

		var computed = getComputedStyle(temp).color;
		document.body.removeChild(temp);

		var match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
		if (!match) {
			return "#000000";
		}
		var r = parseInt(match[1], 10);
		var g = parseInt(match[2], 10);
		var b = parseInt(match[3], 10);
		return (
			"#" +
			((1 << 24) + (r << 16) + (g << 8) + b)
				.toString(16)
				.slice(1)
				.toUpperCase()
		);
	}

	const colorsToGenerateInversionsFor = [
		"--vscode-editor-foreground",
		"--vscode-editorWidget-background",
		"--vscode-disabledForeground",
		"--vscode-errorForeground",
		"--vscode-descriptionForeground",
		"--vscode-scrollbar-shadow"
	]

	function updateInvertedColorVars() {
		for (const cssColorName of colorsToGenerateInversionsFor) {
			const cssColorValue = getComputedStyle(document.body).getPropertyValue(cssColorName).trim();
			const hex = GetHexColorFromValidCSSColor(cssColorValue);
			document.body.style.setProperty(`--inverted-${cssColorName.slice(2)}`, InvertHexColor(hex));
		}
	}

	//kick off initial inversion derivation
	updateInvertedColorVars();

	//setup a mutation observer that'll watch for any
	//of the 'base' colors changing so we can update our inversions appropriately
	var observer = new MutationObserver(function(mutationsList) {
		for (var i = 0; i < mutationsList.length; ++i) {
			var mutation = mutationsList[i];
			if (
				mutation.type === "attributes"
				&& mutation.attributeName === "style"
			) {
				updateInvertedColorVars();
				break;
			}
		}
	});
	//actually observe body for style changes
	observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });

	//also update on theme/color scheme change just to be nice and 'safe'
	if (window.matchMedia) {
		var dark = window.matchMedia('(prefers-color-scheme: dark)');
		var light = window.matchMedia('(prefers-color-scheme: light)');
		var handler = function() { updateInvertedColorVars(); };
		dark.addEventListener('change', handler);
		light.addEventListener('change', handler);
	}

	//Cleanup, cleanup, everybody cleanup!
	onDestroy(() => {
		observer.disconnect();
	});
</script>

<!--
	These are singleton components that tend to self-manage
	and just need to exist in the background on the DOM "somewhere".
-->
<ScaleReflectionSingleton />

<!--
	This is the main container which renders the
	current "page" component and its content.
-->
<div class="page-content-container">
	{#if pageData.pages.has(pageData.currentPage)}
		<svelte:component this={pageData.pages.get(pageData.currentPage)?.component} />
	{:else}
		<!--
			if we can't find a page descriptor for the 'currentPage' key,
			fall back to the 'Unknown' page as a sort of '404'.
		-->
		<Unknown />
	{/if}
</div>

<!-- View-wide radial gradient 'shadow' to add a bit of depth -->
<div class="view-shadow"></div>
<div class="noise-layer" style="background-image: url('{directories.images}/webview/bluenoise/opaque_mono.png');"></div>

<!--
	Persistently present metadata display
	component to render things such as the
	current extension version, whether it's
	out of date, etc.
-->
<MetadataDisplay />

<style>
	.page-content-container {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0px;
		margin: 0px;
	}
	.view-shadow {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: -20;

		background-image: radial-gradient(circle, var(--vscode-editor-background) 0%, var(--vsbloom-shadowing-color) 100%);
	}
	.noise-layer {
		--bg-size-scaled: calc((128px / var(--scale-factor)) * 2.8);

		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: -10;
		opacity: 0.075;
		background-size: var(--bg-size-scaled) var(--bg-size-scaled);
		background-repeat: repeat;
		background-blend-mode: color;
	}
</style>