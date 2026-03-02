<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import DialogPortal from "./dialog-portal.svelte";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import * as Dialog from "./index.js";
	import { cn, type WithoutChildrenOrChild } from "$webview-svelte-lib/utils.js";
	import type { ComponentProps } from "svelte";
	import { directories } from "../../../../Global/Directories.svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
	} = $props();
</script>

<DialogPortal {...portalProps}>
	<Dialog.Overlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			"bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-0 data-[state=open]:zoom-in-0 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg p-6 shadow-lg duration-200",
			className
		)}
		{...restProps}
	>
		<div
			class="bg-background rounded-lg border dialog-background absolute top-0 left-0 w-full h-full select-none pointer-events-none scroll-noise"
			style={`background-image: url('${directories.images}/webview/bluenoise/opaque_mono_90p_transparent.png'); --bg-size-scaled: calc((128px / var(--scale-factor)) * 2.1); background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px); background-repeat: repeat;`}
		></div>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close
				class="[&_svg]:transition-all [&_svg]:duration-200 hover:[&_svg]:scale-125 active:[&_svg]:scale-90 \
				ring-offset-background focus:ring-ring absolute inset-e-2 top-2 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-1 focus:ring-offset-1 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
			>
				<XIcon />
				<span class="sr-only">Close</span>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
