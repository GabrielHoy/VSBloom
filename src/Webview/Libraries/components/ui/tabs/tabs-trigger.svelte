<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$webview-svelte-lib/utils.js';
	import { directories } from '../../../../Global/Directories.svelte';

	let {
		ref = $bindable(null),
		class: className,
		style: trigStyling,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"vsbloom-tabs-trigger transition-all duration-200 hover:not-[data-state=active]:mx-1 data-[state=active]:hover:mx-0 hover:not-[data-state=active]:scale-105 data-[state=active]:hover:scale-100 data-[state=active]:bg-background dark:data-[state=active]:text-foreground hover:not-[data-state=active]:bg-input/25 hover:not-[data-state=active]:border hover:not-[data-state=active]:border-input/50 hover:not-[data-state=active]:text-editor-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-foreground/50 dark:data-[state=active]:bg-input/50 text-editor-foreground dark:text-editor-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className,
	)}
	style="
		--bg-image-url: url('{directories.imagery}/webview/bluenoise/opaque_rgba.png');
		--bg-size-scaled: calc((160px / var(--scale-factor)) * 2.1);
		--scroll-anim-offset-x: calc(var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-x));
		--scroll-anim-offset-y: calc(var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-y));
		${trigStyling}
	"
	{...restProps}
/>

<style>
	:global(.vsbloom-tabs-trigger) {
		position: relative;
		overflow: hidden;
	}

	:global(.vsbloom-tabs-trigger) {
		&[data-state='active']::before {
			opacity: 0.45;
		}

		&::before {
			content: '';
			position: absolute;
			inset: 0;
			z-index: 0;
			pointer-events: none;
			user-select: none;
			display: block;
			width: 100%;
			height: 100%;
			opacity: 0;
			transition: opacity 0.2s ease-out;
			background-image: var(--bg-image-url);
			background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
			background-repeat: repeat;
			background-position: var(--scroll-anim-offset-x) var(--scroll-anim-offset-y);
			filter: blur(calc((1.25px / var(--scale-factor)) * 2.1));
		}
	}
</style>
