<script lang="ts">

</script>

<div class="metadata-display-container">
    <span class="version">yeet</span>
</div>

<style>
    .metadata-display-container {
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        padding: 0;
        margin: 0;
        z-index: -15;

        user-select: none;
        pointer-events: none;
    }
    .version {
        --unclamped-font-scaling: calc((8px / var(--scale-factor)) * 3.141592653);
        --clamped-font-size: min(0.875vmax, var(--unclamped-font-scaling));

        color: color-mix(in srgb, var(--vsbloom-shadowing-color) 50%, white 50%);

        position: absolute;
        left: 0.5em;
        bottom: 0.275em;
        font-size: var(--clamped-font-size);
    }
</style>