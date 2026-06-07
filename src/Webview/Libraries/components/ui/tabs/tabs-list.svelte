<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$webview-svelte-lib/utils.js';
	import { directories } from '../../../../Global/Directories.svelte';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.ListProps = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={cn(
		'vsbloom-tabs-list bg-input/15 border-input/50 border shadow-xs hover:scale-[1.025] active:scale-100 hover:bg-input/20 rounded-md text-sm font-medium whitespace-nowrap transition-all inline-flex h-9 w-fit items-center justify-center p-[3px]',
		className,
	)}
	style="
		--bg-image-url: url('{directories.imagery}/webview/bluenoise/opaque_mono.png');
		--bg-size-scaled: calc((160px / var(--scale-factor)) * 2.1);
		--scroll-anim-offset-x: calc(var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-x));
		--scroll-anim-offset-y: calc(var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-y));
	"
	{...restProps}
></TabsPrimitive.List>

<style>
	:global(.vsbloom-tabs-list) {
		position: relative;
		overflow: hidden;
	}

	:global(.vsbloom-tabs-list::before) {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		user-select: none;
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0.25;
		background-image: var(--bg-image-url);
		background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
		background-repeat: repeat;
		background-position: var(--scroll-anim-offset-x) var(--scroll-anim-offset-y);
		filter: blur(calc((1.25px / var(--scale-factor)) * 2.1));
	}
</style>
