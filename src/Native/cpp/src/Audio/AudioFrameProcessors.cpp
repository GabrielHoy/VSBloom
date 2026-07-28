#include "Audio/AudioFrameProcessors.hpp"
#include "CaptureManager.hpp"
#include "IPC/IPCSendables.hpp"
#include "IPC/Router/IPCRouter.hpp"

namespace VSBloom::Audio {

    const std::unordered_map<std::string, FrameAggregationCallback_t> frameAggregationCallbacks = {
        {"send-over-ipc",
         [](const AnalyzedAudioFrame& newFrame) -> void {
        static VSBloom::IPC::IPCRouter& ipcRouter = VSBloom::IPC::IPCRouter::GetInstance();

        ipcRouter.SendMessage(VSBloom::IPC::NewAudioAnalysisFrameMessage{newFrame});
    }},
        {"sink", [](const AnalyzedAudioFrame&) -> void {}},
    };

} // namespace VSBloom::Audio