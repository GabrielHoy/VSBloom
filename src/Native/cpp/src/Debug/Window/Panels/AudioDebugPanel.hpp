/**
 * Audio Debug Panel
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

    #include "Audio/CaptureManager.hpp"
    #include "Audio/Device/AudioDevice.hpp"
    #include "BasePanel.hpp"
    #include <mutex>
    #include <string>
    #include <unordered_map>
    #include <vector>

namespace VSBloom::Debug {

    class AudioDebugPanel final : public BasePanel {
      public:
        // Read by DebugWindow.cpp to drive the window's background color -
        // public since this class doesn't own a render loop of its own.
        std::mutex                latestSnapshotMutex;
        Audio::AnalyzedAudioFrame latestSnapshot;

        AudioDebugPanel();
        ~AudioDebugPanel();

        void RefreshDeviceList();

        /**
         * Draws this frame's ImGui content. Must be called between
         * ImGui::NewFrame() and ImGui::Render().
         */
        void DrawUI() override;

      private:
        virtual void Initialize() override;
        void         ApplySelectionToCaptureManager();

        Audio::CaptureManager captureManager;

        std::vector<Audio::AudioDevice>       devices;
        std::unordered_map<std::string, bool> selectedDeviceIds;
        std::mutex                            deviceChangeMutex;
    };

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
