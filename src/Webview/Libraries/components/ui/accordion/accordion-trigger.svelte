<script lang="ts">
	import { Accordion as AccordionPrimitive } from "bits-ui";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import { cn, type WithoutChild } from "$webview-svelte-lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		level = 3,
		children,
		...restProps
	}: WithoutChild<AccordionPrimitive.TriggerProps> & {
		level?: AccordionPrimitive.HeaderProps["level"];
	} = $props();
</script>

<AccordionPrimitive.Header {level} class="flex">
	<AccordionPrimitive.Trigger
		data-slot="accordion-trigger"
		bind:ref
		class={cn(
			"focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-center justify-center gap-2 rounded-md py-3 text-center text-2xl font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 data-[state=closed]:text-xl [&[data-state=open]>svg:first-child]:-rotate-90 [&[data-state=open]>svg:last-child]:rotate-90",
			className
		)}
		{...restProps}
	>
		<ChevronLeftIcon
			class="text-muted-foreground pointer-events-none size-5 shrink-0 my-auto transition-transform duration-500"
		/>
		{@render children?.()}
		<ChevronRightIcon
			class="text-muted-foreground pointer-events-none size-5 shrink-0 my-auto transition-transform duration-500"
		/>
	</AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>