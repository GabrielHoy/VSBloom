/**
 * VSBloom Native Runtime Entry Point
 *
 * This file serves as the main entry point for VSBloom's native runtime.
 *
 * Welcome to C++ land! Real magic can happen here.
 *
 * This file gets compiled into a native binary that is used
 * to power the extension's functionality which requires the
 * utilization of operating-system specific functionality.
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
#include "IPC/Cryptography/IPCCryptography.hpp"
#include "IPC/IPCSendables.hpp"
#include "IPC/Listener/IPCListener.hpp"
#include "IPC/Methods/IPCMethods.hpp"
#include "IPC/Router/IPCRouter.hpp"
#include <cstdlib>
#include <functional>
#include <future>
#include <iostream>

int main() {
    // The Native Runtime's process is intended to have its lifetime managed
    // primarily by the parent VSBloom Extension process(unless that process
    // terminates unexpectedly) and the IPCListener class facilitates that
    // for us - so once we end up finishing our work in the main thread here,
    // instead of returning and exiting the process we're going to wait upon
    // this procShutdownFuture to be fulfilled - signalling that either the
    // parent process terminated unexpectedly OR that the parent process has
    // instructed us to shutdown.
    // The idea is that in the interim once we're waiting upon this future at
    // the bottom of the `main` function, the IPCListener has its own thread
    // responsible for listening to and processing/dispatching messages from
    // the parent process - that thread's work will essentially form the foundation
    // of the *actual* loop behind the Native Runtime and its functionality.
    std::promise<void> procShutdownSignal;
    std::future<void>  procShutdownFuture = procShutdownSignal.get_future();

    // Generate an encryption key before we do pretty much anything
    // in terms of IPC traffic, so that we have it before any traffic
    // arrives for us to process
    const VSBloom::IPC::Cryptography::EncryptionKey encryptionKey =
        VSBloom::IPC::Cryptography::GenerateSessionEncryptionKey();
    const std::string hexEncryptionKey = VSBloom::IPC::Cryptography::KeyToHex(encryptionKey);

    // The IPCRouter will be responsible for correctly parsing and routing
    // any incoming messages from the parent process it receives into their
    // correct handler methods, defined by the `methodRequestHandlers` map.
    VSBloom::IPC::IPCRouter ipcRouter(
        VSBloom::IPC::methodRequestHandlers,
        VSBloom::IPC::DefaultMessageSubmissionCallback
    );

    // Now that we have a valid IPC Router to work with, we can setup the
    // IPC Listener in order to start listening for messages from the parent
    // process over stdin and dispatch them into the IPC Router's matching
    // request handler method - OnNewMessageReceived - to be parsed and routed
    // accordingly from there.
    VSBloom::IPC::IPCListener ipcListener([&ipcRouter](const std::string& incomingMsg) -> void {
        ipcRouter.OnNewMessageReceived(incomingMsg);
    }, [&procShutdownSignal]() -> void { procShutdownSignal.set_value(); });

    bool couldBootstrapIPCListener = ipcListener.TryIPCBootstrap();
    if (!couldBootstrapIPCListener) {
        std::cerr
            << "[FATAL] Failed to bootstrap the IPC Listener, we cannot continue executing without certainty that our process will exit when the parent process does - exiting native runtime for safety..."
            << std::endl;
        return EXIT_FAILURE;
    }

    // Now that we've successfully bootstrapped the IPC Listener and we're
    // all set up, let's notify the parent process to begin the startup
    // handshake and allow for actual functionality to begin! This message
    // will act as a trigger for the parent process to know we're generally 'alive'
    // as well as carrying our encryption key as a one-time message so that the
    // only thing that can end up actually sending us valid traffic ends up being
    // the parent process which received said key.
    ipcRouter.SendMessage(VSBloom::IPC::StartupSuccessMessage{hexEncryptionKey});

    // All messages in both directions from this point onward are AES-256-GCM encrypted
    // now that we've sent the encryption key over and assigned our router the key
    // to utilize for all subsequent traffic accordingly.
    ipcRouter.SetEncryptionKey(encryptionKey);

#ifdef DEBUG
    // When in debug mode, we'll simulate a quick invocation of the 'debug-test-message' IPC method for testing purposes
    nlohmann::json initialDebugMessage = {{"type", "audio-device-enumeration"}, {"data", {{"unused", "42"}}}};

    const std::string dbgMsgStr = initialDebugMessage.dump();
    ipcRouter.OnNewMessageReceived(
        nlohmann::json{
            {"_dbg", true},
            {"enc", VSBloom::IPC::Cryptography::Base64::Encode((uint8_t*)dbgMsgStr.data(), dbgMsgStr.size())}
        }.dump()
        // "{\"_dbg\": true, \"enc\": \"eyJ0eXBlIjogImRlYnVnLXRlc3QtbWVzc2FnZSIsICJkYXRhIjogeyJ1bnVzZWQiOiAiNDIifX0=\"}"
    );
#endif

    // We're now completely setup and ready to go, so we'll wait upon the
    // procShutdownFuture to be fulfilled signalling that we should exit
    // the process accordingly.
    procShutdownFuture.wait();
    return EXIT_SUCCESS;
}