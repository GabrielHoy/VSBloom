<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { directories } from "../../../../Global/Directories.svelte";

	let {
		ref = $bindable(null),
		style: trigStyling,
		...restProps
		}: DialogPrimitive.TriggerProps = $props();
</script>

<DialogPrimitive.Trigger
	bind:ref
	data-slot="dialog-trigger"
	style={`background-image: url('${directories.images}/webview/bluenoise/opaque_mono_90p_transparent.png'); ${trigStyling ?? ""}`}
	{...restProps}
/>
