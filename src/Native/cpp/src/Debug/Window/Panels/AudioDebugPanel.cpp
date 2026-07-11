#if defined(DEBUG_WINDOW_ENABLED)

    #include "AudioDebugPanel.hpp"
    #include "Audio/Device/DeviceEnumeration.hpp"
    #include "Debug/Window/ImGui/imconfig.hpp"
    #include <algorithm>
    #include <format>
    #include <imgui.h>

namespace VSBloom::Debug {

    AudioDebugPanel::AudioDebugPanel()
        : BasePanel() {
    }

    AudioDebugPanel::~AudioDebugPanel() {
    }

    void AudioDebugPanel::Initialize() {
        captureManager.SetOnFrameAggregatedCallback([this](const Audio::AnalyzedAudioFrame& snapshot) {
            std::lock_guard<std::mutex> lock(latestSnapshotMutex);
            latestSnapshot = snapshot;
        });
        RefreshDeviceList();
    }

    void AudioDebugPanel::ApplySelectionToCaptureManager() {
        std::vector<std::string> desiredDeviceIds;
        for (const auto& entry : selectedDeviceIds) {
            if (entry.second) {
                desiredDeviceIds.push_back(entry.first);
            }
        }
        captureManager.UpdateCurrentCapturedDevices(desiredDeviceIds);
    }

    void AudioDebugPanel::RefreshDeviceList() {
        std::lock_guard<std::mutex> deviceChangeLock(deviceChangeMutex);

        devices = Audio::EnumerateAudioDevices();
        for (const Audio::AudioDevice& device : devices) {
            selectedDeviceIds.try_emplace(device.id, false);
        }
    }

    void AudioDebugPanel::DrawUI() {
        Audio::AnalyzedAudioFrame aggregatedSnapshot;
        {
            ImGui::Begin("Audio Device Enumeration");

            ImGui::SeparatorText("Render Devices");
            if (ImGui::Button("Refresh")) {
                RefreshDeviceList();
            }
            ImGui::Spacing();

            static bool hasAutoSelectedDefaultAudioDevice = false;
            for (const Audio::AudioDevice& device : devices) {
                bool&             selected = selectedDeviceIds[device.id];
                const std::string label    = device.name + (device.isDefault ? " (default)" : "");
                if (ImGui::Checkbox(label.c_str(), &selected)
                    || (SELECT_DEFAULT_AUDIO_DEVICE_ON_STARTUP && device.isDefault && !selected
                        && !hasAutoSelectedDefaultAudioDevice && ([&selected]() -> bool {
                    hasAutoSelectedDefaultAudioDevice = true;
                    selected                          = true;
                    return true;
                })())) {
                    ApplySelectionToCaptureManager();
                }
            }

            ImGui::Separator();

            {
                std::lock_guard<std::mutex> lock(latestSnapshotMutex);
                aggregatedSnapshot = latestSnapshot;
            }

            ImGui::End();
        }

        {
            ImGui::Begin("Audio Aggregation");

            ImGui::SeparatorText("Amplitude");

            ImGui::CenteredText(std::format("Merged Average: {:.4f}", aggregatedSnapshot.avgAmplitude).c_str());
            ImGui::ProgressBar(std::clamp(aggregatedSnapshot.avgAmplitude, 0.0f, 1.0f), ImVec2(-1.0f, 0.0f));

            ImGui::Spacing();
            ImGui::Spacing();
            ImGui::SeparatorText("Merged FFT Bins");

            ImGui::PlotHistogram(
                "##fftBins",
                aggregatedSnapshot.fftBins.data(),
                static_cast<int>(aggregatedSnapshot.fftBins.size()),
                0,
                "20Hz - 22.5kHz",
                0.0f,
                1.0f,
                ImVec2(0, 120)
            );

            ImGui::Spacing();
            ImGui::Separator();

            ImGui::End();
        }
    }

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
