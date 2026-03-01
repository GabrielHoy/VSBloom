<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn, type WithoutChild } from "$webview-svelte-lib/utils.js";
	import { directories } from "../../../../Global/Directories.svelte";

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children: childrenProp,
		...restProps
	}: WithoutChild<SelectPrimitive.ItemProps> = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	data-slot="select-item"
	class={cn(
		"transition-all duration-150 \
		text-sm data-selected:skew-x-0 not-[data-highlighted]:-skew-x-6 data-highlighted:skew-x-0 \
		data-highlighted:underline decoration-current/25 data-highlighted:text-accent-foreground data-highlighted:bg-accent/25 data-highlighted:border border-current/25 \
		[&_svg:not([class*='text-'])]:text-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 ps-2 pe-8 outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
		className
	)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
			<!-- {#if selected}
				<span class="absolute inset-e-2 flex size-3.5 items-center justify-center">
					<CheckIcon class="size-4 text-foreground" />
				</span>
			{/if} -->
		{#if childrenProp}
			{@render childrenProp({ selected, highlighted })}
		{:else}
			{label || value}
		{/if}
	{/snippet}
</SelectPrimitive.Item>
