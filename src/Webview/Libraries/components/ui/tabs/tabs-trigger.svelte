<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { cn } from "$webview-svelte-lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"transition-all duration-400 hover:not-[data-state=active]:mx-1 data-[state=active]:hover:mx-0 hover:not-[data-state=active]:scale-105 data-[state=active]:hover:scale-100 data-[state=active]:bg-background dark:data-[state=active]:text-foreground hover:not-[data-state=active]:bg-input/25 hover:not-[data-state=active]:border hover:not-[data-state=active]:border-input/50 hover:not-[data-state=active]:text-editor-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/50 text-editor-foreground dark:text-editor-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
/>
