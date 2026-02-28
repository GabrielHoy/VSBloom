<script lang="ts">
    import { Button } from "$webview-svelte-lib/components/ui/button";
    import { Separator } from "$webview-svelte-lib/components/ui/separator";
    import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
    import { SetCurrentPage } from "../Global/Pages.svelte";
    import { Spinner } from "$webview-svelte-lib/components/ui/spinner";

    let {
        title,
        children = null
    } = $props();

    let swappingPage = $state(false);
</script>

<div class="page-header">
    <div class="page-header-left">
        <Button
            size="sm"
            class="origin-left"
            disabled={swappingPage}
            onclick={() => {
                swappingPage = true;
                setTimeout(() => {
                    swappingPage = false;
                    SetCurrentPage("Main Menu");
                }, 250);
            }}
        >
            {#if swappingPage}
                <Spinner />
            {:else}
                <ChevronLeftIcon />
            {/if}
            <p>Main Menu</p>
        </Button>
    </div>
    
    <h1 class="page-header-title">
        {title}
    </h1>
    
    <div class="page-header-right">
        {@render children?.()}
    </div>

</div>

<Separator orientation="horizontal" style="background: linear-gradient(to right, transparent, var(--vscode-editor-foreground), transparent);"/>

<style>
    .page-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        width: 100%;
        height: calc(var(--spacing) * 10);
        padding: var(--spacing);
        margin: 0;
    }
    .page-header-left {
        justify-self: start;
        min-width: 0;
    }
    .page-header-title {
        font-size: calc(var(--spacing) * 5);
        font-weight: 500;
        text-align: center;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 0;
        margin: 0;
        pointer-events: none;
        user-select: none;
    }
    .page-header-right {
        justify-self: end;
        min-width: 0;
    }
</style>