<script lang="ts">
    import { onMount } from "svelte";
    import { directories } from "../Global/Directories.svelte";

    let {
        visible = true,
        text = "VS: Bloom",
        height = "25vh",
        paddingTop = "2.25vh",
        subTitle = "",
        maxHeightVh = 25,
        minHeightVh = 15
    } = $props();


    let textBaseSize = $derived(`calc(clamp(${minHeightVh*0.25}vh, ${height} * 0.25 - 0.125em, ${maxHeightVh*0.25}vh))`);
    let subTextBaseSize = $derived(`calc(clamp(${minHeightVh*0.1}vh, ${height} * 0.1 - 0.025em, ${maxHeightVh*0.1}vh))`);
</script>

{#if visible}
    <div class="splash-container" style="padding-top: {paddingTop}; max-height: {maxHeightVh}vh; min-height: {minHeightVh}vh; font-size: {textBaseSize};">
        <img class="splash-image" src="{directories.images}/logo.png" style="height: calc({height} * 0.6); max-height: {maxHeightVh*0.6}vh; min-height: {minHeightVh*0.6}vh;" alt="VS: Bloom Logo" />
        <p class="splash-title" style="line-height: {textBaseSize}; height: {textBaseSize}; margin-top: calc({textBaseSize} * 0.2); max-height: {maxHeightVh*0.25}vh; min-height: {minHeightVh*0.25}vh;">{text}</p> 
        <span class="header-separator-decoration" style="max-width: calc({textBaseSize} * 6.18);"></span>
        <p class="splash-sub-title" style="font-size: {subTextBaseSize}; line-height: {subTextBaseSize}; height: {subTextBaseSize}; max-height: {maxHeightVh*0.1}vh; min-height: {minHeightVh*0.1}vh;">{subTitle}</p>
    </div>
{/if}

<style>
    .splash-container {
		display: block;
		width: auto;
		padding: 0 0 0 0;
        margin: 0 auto;
	}
    .splash-image {
        display: block;
        width: auto;
        margin: 0 auto;
        pointer-events: none;
        user-select: none;
        filter: drop-shadow(0 0 1.75vh rgba(0,0,0,0.5));
    }
    .splash-title {
        text-align: center;
        width: auto;
        margin: 0 auto;
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
    }
    .splash-sub-title {
        text-align: center;
        width: auto;
        margin: 0 auto;
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
    }
    .header-separator-decoration {
        display: block;
        width: 8em;
        height: 1px;
        background: linear-gradient(to right, transparent, var(--vscode-editor-foreground), transparent);
        margin: 0.075em auto 0.075em auto;
    }
</style>