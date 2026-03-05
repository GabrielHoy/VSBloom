<script lang="ts">
	let { children, ...restProps } = $props();
</script>

<div class="main-page-container" {...restProps}>
	{@render children()}
</div>

<style>
	.main-page-container {
		width: 100%;
		height: 100%;
		padding: 0;
		margin: 0;

		font-size: calc((13px / var(--scale-factor)) * 2.15);
	}
</style>
