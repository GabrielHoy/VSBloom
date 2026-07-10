/**
 * Debug Visualization Window
 *
 * Only compiled into builds in Debug/Win32 configurations, this is a small
 * ImGui / Win32 / DX11 window for visually verifying that complex data
 * is being processed correctly by the runtime.
 *
 * The DebugWindow is going to be hacked on a lot, expect messy code here.
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

namespace VSBloom::Debug {

    /**
     * Blocks the calling thread while the debug window is running.
     */
    void RunAudioDebugWindow();

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
