<script lang="ts">
    let {
        children
    } = $props();
</script>

<div class="main-page-container">
    {@render children()}
</div>

<style>
    .main-page-container {
        width: 100%;
        height: 100%;
        padding: 0;
        margin: 0;
    }
</style>