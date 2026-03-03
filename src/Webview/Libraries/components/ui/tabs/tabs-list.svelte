<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { cn } from "$webview-svelte-lib/utils.js";
	import { directories } from "../../../../Global/Directories.svelte";

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
		"bg-input/15 border-input/50 border shadow-xs hover:scale-[1.025] active:scale-100 hover:bg-input/20 rounded-md text-sm font-medium whitespace-nowrap transition-all inline-flex h-9 w-fit items-center justify-center p-[3px]",
		className
	)}
	style="background-image: url('{directories.imagery}/webview/bluenoise/opaque_mono_90p_transparent.png'); --bg-size-scaled: calc((160px / var(--scale-factor)) * 2.1); background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px); background-repeat: repeat; animation: scrollNoise 32.36s linear infinite;"
	{...restProps}
/>