<script lang="ts">
	interface Props {
		/** indicator position in % */
		pos: { x: number; y: number };
	}

	let { pos }: Props = $props();
</script>

<div class="picker-indicator" style:--pos-x={pos.x} style:--pos-y={pos.y}></div>

<style>
	div {
		position: absolute;
		left: calc(var(--pos-x) * (calc(var(--spacing) * 50) - calc(var(--spacing) * 0.25)) / 100 - calc(var(--spacing) * 3.14159) / 2 + calc(var(--spacing) * 0.125));
		top: calc(var(--pos-y) * (calc(var(--spacing) * 50) - calc(var(--spacing) * 0.25)) / 100 - calc(var(--spacing) * 3.14159) / 2 + calc(var(--spacing) * 0.125));

		width: calc(var(--spacing) * 3.14159);
		height: calc(var(--spacing) * 3.14159);
		background-color: white;
		box-shadow: 0 0 4px black;
		border-radius: 50%;

		pointer-events: none;
		z-index: 1;
		/* transition: box-shadow 0.2s, left 0.2s var(--vsbloom-bouncy-ease), top 0.2s var(--vsbloom-bouncy-ease); */
		transition: box-shadow 0.2s var(--vsbloom-bouncy-ease);
	}
</style>
