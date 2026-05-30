/**
 * This file serves as the main entry point for VSBloom's native runtime.
 *
 * This file gets compiled into a native binary that is used
 * to power the extension's functionality which requires the
 * utilization of operating-system specific functionality,
 * in particular - things such as the WASAPI Loopback Capture
 * API on Windows, and equivalents on other platforms.
 *
 * ?To immediately address the elephant in the room presented
 * by this runtime's existence - as addressed in `Patcher/ClientPatcher.ts`
 * similarly in depth - this native runtime is intended purely to *supplement*
 * VSBloom's core functionality and be exposed as an *optional* feature that
 * users can enable or disable to their liking, ensuring that full transparency
 * is consistently maintained throughout the extension's bootstrapping and
 * patching process - with the end goal that VSBloom does not *ever* end up
 * doing something that the user would not expect or does not actively approve
 * of. This is especially important with native runtimes/executables like this
 * for obvious reasons, and that importance becomes magnitudes higher when
 * things like audio loopback capture are involved due to the nature of PII
 * that may be captured in the audio streams etc.
 * To combat the above concerns and mitigate any concerns about possible abuse,
 * there is zero telemetry of any kind being collected or sent to any
 * third-parties stemming from or involved with the native runtime.
 ** TL;DR: To mitigate immediately apparent security concerns, the promise is
 ** made that *everything* in this C++ project and under the `src/Native/cpp/`
 ** directory remains free from *any* logging, external network requests, or
 ** otherwise any telemetry or external data collection whatsoever. Your data
 ** will not be tracked, and nothing shall exist to facilitate any such
 ** behavior.
 *
 * ...With that being said, let's get to it!
 */
#include "IPC.hpp"
#include "Platform.hpp"
#include <chrono>
#include <cstdlib>
#include <iostream>

void OnParentProcessTerminated() {
    std::cout << "Parent process terminated, exiting process..." << std::endl;
    // std::_Exit(EXIT_SUCCESS); //TODO: Uncomment once ready to actually begin
}

int main() {
    const std::string platformSlug = VSBloom::GetPlatformSlug();

    std::cout << "Hello, World!" << std::endl;
    std::cout << "Platform: " << platformSlug << std::endl;
    std::cout << "Beginning callback registration..." << std::endl;

    bool couldSyncProcTerm = VSBloom::IPC::SynchronizeWithParentProcessTermination(OnParentProcessTerminated);

    if (!couldSyncProcTerm) {
        std::cout
            << "[FATAL] Failed to register parent process termination callback, we cannot continue executing without certainty that our process will exit when the parent process does - exiting native runtime for safety..."
            << std::endl;
        return EXIT_FAILURE;
    }

    // TODO: Loopback capture per-device instead of yielding indefinitely.
    std::this_thread::sleep_for(std::chrono::seconds(60 * 10));
}
