<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import { cn, type WithoutChild } from "$webview-svelte-lib/utils.js";
	import { directories } from "../../../../Global/Directories.svelte";

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = "default",
		style: selStyling,
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"[&_svg]:transition-all [&_svg]:duration-500 [&_svg]:py-0 \
		transition-all duration-300 \
		data-[state=closed]:[&_svg]:ml-1.5 data-[state=closed]:[&_svg]:-mr-2.5 data-[state=closed]:[&_svg]:-rotate-90 data-[state=closed]:[&_svg]:scale-95 \
		data-[state=open]:[&_svg]:ml-0.5 data-[state=open]:[&_svg]:-mr-1.5 data-[state=open]:[&_svg]:rotate-0 data-[state=open]:[&_svg:not([class*='text-'])]:text-foreground data-[state=open]:[&_svg:not([class*='text-'])]:scale-110 \
		hover:data-[state=closed]:scale-110 hover:data-[state=closed]:border-foreground hover:data-[state=open]:scale-100 data-[state=open]:border-foreground \
		bg-background dark:bg-input/30  \
		data-[state=open]:bg-input/60 dark:data-[state=open]:bg-input/60 hover:bg-input/50 dark:hover:bg-input/50 \
		gap-1 \
		border-input data-placeholder:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-fit items-center justify-between rounded-md border px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none select-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	style={`background-image: url('${directories.imagery}/webview/bluenoise/opaque_mono_90p_transparent.png'); ${selStyling}`}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon class="size-4" />
</SelectPrimitive.Trigger>
