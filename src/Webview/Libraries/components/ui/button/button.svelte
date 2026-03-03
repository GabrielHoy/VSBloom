<script lang="ts" module>
	import { cn, type WithElementRef } from "$webview-svelte-lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";
	import { directories } from "../../../../Global/Directories.svelte";

	export const buttonVariants = tv({
		base: "shad-button focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs",
				bloom: "bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border shadow-xs",
				destructive:
					"bg-destructive hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 text-white shadow-xs",
				outline:
					"bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border shadow-xs",
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs",
				ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
				lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
				icon: "size-9",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "bloom",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			ondisabledclick?: HTMLButtonAttributes["onclick"];
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "bloom",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		style: btnStyling,
		onclick,
		ondisabledclick = () => {},
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className, disabled ? "shad-disabled" : "shad-enabled", variant ? `${variant}-variant` : undefined)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		style="background-image: url('{directories.imagery}/webview/bluenoise/opaque_mono_90p_transparent.png'); {btnStyling}"
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className, disabled ? "shad-disabled" : "shad-enabled", variant ? `${variant}-variant` : undefined)}
		style="background-image: url('{directories.imagery}/webview/bluenoise/opaque_mono_90p_transparent.png'); {btnStyling}"
		onclick={disabled ? ondisabledclick : onclick}
		{type}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}

<style>
	@keyframes scrollNoise {
        0% { background-position: 0 0; }
        100% { background-position: var(--bg-size-scaled) var(--bg-size-scaled); }
    }

	.shad-button {
		&.bloom-variant {
			text-shadow: var(--vsbloom-text-drop-shadow);
			background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
			background-repeat: repeat;
	
			animation: scrollNoise 16.18s linear infinite;


			&.shad-disabled {
				--bg-size-scaled: calc((128px / var(--scale-factor)) * 2.1);
	
				opacity: 0.5;
				cursor: not-allowed;
				filter: grayscale(50%) blur(0.015em);
	
				&:hover {
					color: currentColor;
					background-color: color-mix(in srgb, var(--input) 30%, transparent);
				}
			}
	
			&.shad-enabled {
				--bg-size-scaled: calc((160px / var(--scale-factor)) * 2.1);
	
				cursor: pointer;

				&:hover {
					border-color: var(--foreground);
					transform: scale(1.075);
					box-shadow: 0 0 0.125em var(--vsbloom-text-border-color);
				}

				&:active {
					transform: scale(0.9);
					filter: brightness(90%);
				}
			}
		}
	}

	
</style>