<script lang="ts">
	import { colord, type Colord } from 'colord';

	let {
		color,
		style: pickerPreviewStyling,
		class: pickerPreviewClass,
		...restProps
	}: {
		style?: string;
		class?: string;
		color: Colord;
		[key: string]: any;
	} = $props();
</script>

<div
	class="color-picker-preview w-full h-full {pickerPreviewClass ?? ''}"
	style="--col: {color.toHex()}; --col-no-alpha: {color
		.alpha(1)
		.toHex()}; --col-alpha: {color.alpha()}; {pickerPreviewStyling ?? ''}"
	{...restProps}
></div>

<style>
	.color-picker-preview {
		position: relative;
		--grid-size-base: calc((0.1618em / var(--scale-factor)) * 2);
		--alpha-grid-bg:
			linear-gradient(45deg, #eee 25%, #0000 25%, #0000 75%, #eee 75%) 0 0 /
				calc(var(--grid-size-base) * 2) calc(var(--grid-size-base) * 2),
			linear-gradient(45deg, #eee 25%, #0000 25%, #0000 75%, #eee 75%) var(--grid-size-base)
				var(--grid-size-base) / calc(var(--grid-size-base) * 2)
				calc(var(--grid-size-base) * 2);

		--track-background:
			linear-gradient(to bottom, rgba(0, 0, 0, 0), var(--col-no-alpha)), var(--alpha-grid-bg);

		background-image:
			linear-gradient(45deg, #eee 25%, #0000 25%, #0000 75%, #eee 75%),
			linear-gradient(45deg, #eee 25%, #0000 25%, #0000 75%, #eee 75%);
		background-position:
			0 0,
			var(--grid-size-base) var(--grid-size-base);
		background-size: calc(var(--grid-size-base) * 2) calc(var(--grid-size-base) * 2);
		background-color: black;

		mask-image: radial-gradient(circle at 50% 50%, black 35%, transparent 61.8%);
	}

	.color-picker-preview::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--col-no-alpha);
		mask-image: linear-gradient(
			to bottom,
			black 0%,
			black 50%,
			rgba(0, 0, 0, var(--col-alpha)) 100%
		);
	}
</style>
