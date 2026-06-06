<!-- 
    MouseLocationProvider is a component
    that reflects the current position of
    the mouse cursor in the webview, in
    a few different formats.
-->
<script module lang="ts">
	export let mouseLocation = $state({
		absolute: { x: 0, y: 0 },
		normalized: { x: 0, y: 0 },
	});

	function UpdateMouseLocation(event: PointerEvent) {
		mouseLocation.absolute.x = event.clientX;
		mouseLocation.absolute.y = event.clientY;

		mouseLocation.normalized.x = mouseLocation.absolute.x / window.innerWidth;
		mouseLocation.normalized.y = mouseLocation.absolute.y / window.innerHeight;
	}

	document.addEventListener('pointermove', UpdateMouseLocation);
</script>
