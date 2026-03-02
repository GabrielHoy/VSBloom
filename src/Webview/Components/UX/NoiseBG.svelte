<script lang="ts">
    import { directories } from "../../Global/Directories.svelte";

    let {
        scrollSpeed = 1,
        scaleFactor = 1,
        opacity = 1,
        style: nsStyling = "",
        ...restProps
    } = $props();

</script>

<div
    class="noise-bg"
    style="background-image: url('{directories.images}/webview/bluenoise/opaque_mono.png'); --bg-size-scaled: calc(({128 * scaleFactor}px / var(--scale-factor)) * 2.1); animation: scrollNoise {16.18 * scrollSpeed}s linear infinite; opacity: {opacity}; {nsStyling}"
    {...restProps}
></div>

<style>
    .noise-bg {
        background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
        background-repeat: repeat;
        pointer-events: none;
        user-select: none;
    }
</style>