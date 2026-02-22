<!-- 
    ScaleReflectionSingleton is a component
    that reflects the scaling factor of the
    window (window.devicePixelRatio) to a
    CSS variable --scale-factor on the global
    `body` element.
-->
<script module>
    import { vscode } from "../../Util/VSCodeAPI";

    const DEBUG = false;

    let scalingFactor = $state(window.devicePixelRatio ?? 1);

    (function UpdateScalingFactor() {
        //debug to inspect scaling
        if (DEBUG) {
            vscode.PostToExtension({
                type: 'send-notification',
                data: {
                    type: 'info',
                    message: scalingFactor == window.devicePixelRatio ? `[VSBloom]: Current Scaling Factor: ${scalingFactor.toFixed(2)}` : `[VSBloom]: New Scaling Factor: ${window.devicePixelRatio.toFixed(2)}`
                }
            });
        }

        //actual logic
        scalingFactor = window.devicePixelRatio;
        document.body.style.setProperty("--scale-factor", scalingFactor.toString());


        matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener("change", UpdateScalingFactor, {once: true});
    })();
</script>