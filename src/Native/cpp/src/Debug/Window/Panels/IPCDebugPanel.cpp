
#include "Debug/Window/Panels/AudioDebugPanel.hpp"
#if defined(DEBUG_WINDOW_ENABLED)

    #include "Audio/Device/DeviceEnumeration.hpp"
    #include "AudioDebugPanel.hpp"
    #include "Debug/Window/MainDebugWindow.hpp"
    #include "IPC/IPCSendables.hpp"
    #include "IPC/Router/IPCRouter.hpp"
    #include "IPCDebugPanel.hpp"
    #include <GLFW/glfw3.h>
    #include <imgui.h>

using json_t = nlohmann::json;

namespace VSBloom::Debug {

    IPCDebugPanel::IPCDebugPanel()
        : BasePanel() {
    }

    IPCDebugPanel::~IPCDebugPanel() {
    }

    void IPCDebugPanel::RegisterNewSendableGenerator(const std::string& prettyName, IPCSendableGenerator_t generator) {
        sendableGenerators[prettyName] = generator;
    }

    void IPCDebugPanel::Initialize() {
        RegisterNewSendableGenerator("Debug Output", []() -> IPC::DebugOutputMessage {
            static int debugOutputCounter = 0;

            return {{"testMessageNumber", debugOutputCounter++}};
        });

        RegisterNewSendableGenerator("Sync Available Audio Device List", []() -> IPC::AvailableAudioDeviceListMessage {
            const std::vector<VSBloom::Audio::AudioDevice> curDevices = VSBloom::Audio::EnumerateAudioDevices();

            return {{curDevices}};
        });

        RegisterNewSendableGenerator(
            "Send Current Audio Analysis Frame",
            [this]() -> IPC::NewAudioAnalysisFrameMessage {
            AudioDebugPanel* audioDebugPanel = dynamic_cast<AudioDebugPanel*>(mainWindow->panels["audio"].get());

            if (audioDebugPanel == nullptr) {
                throw std::runtime_error(
                    "AudioDebugPanel not found to send current audio analysis frame when requested by the user in the IPC Messaging panel"
                );
            }

            return {audioDebugPanel->latestSnapshot};
        }
        );
    }

    void IPCDebugPanel::DrawUI() {
        ImGui::Begin("IPC Messaging");

        ImGui::SeparatorText("Sendable");

        if (ImGui::BeginTable(
                "IPCSendable Tests",
                2,
                ImGuiTableFlags_Borders | ImGuiTableFlags_RowBg | ImGuiTableFlags_SizingFixedFit
            )) {
            ImGui::TableSetupColumn("IPCSendable_NameColumn", ImGuiTableColumnFlags_WidthStretch, -1.0f);
            ImGui::TableSetupColumn(
                "IPCSendable_SendButtonColumn",
                ImGuiTableColumnFlags_WidthFixed | ImGuiTableColumnFlags_NoHeaderWidth,
                35.0f
            );

            for (const auto& [sendableGeneratorName, sendableGenerator] : sendableGenerators) {
                ImGui::TableNextRow();

                // Column 0: Name Label
                ImGui::TableSetColumnIndex(0);
                ImGui::AlignTextToFramePadding();
                ImGui::BulletText("%s", sendableGeneratorName.c_str());

                // Column 1: Send Button
                ImGui::TableSetColumnIndex(1);
                std::string buttonId = "Send##" + sendableGeneratorName;
                if (ImGui::Button(buttonId.c_str())) {
                    IPC::IPCRouter&  ipcRouter         = IPC::IPCRouter::GetInstance();
                    IPC::IPCSendable generatedSendable = sendableGenerator();

                    ipcRouter.SendMessage(generatedSendable);
                }
            }

            ImGui::EndTable();

            ImGui::NewLine();
        }

        /*
        ImGui::SeparatorText("Receivable Messages");
        if (ImGui::BeginChild("ReceivedMessageLogs", ImVec2(0.0f, -10.0f), ImGuiChildFlags_FrameStyle)) {
            std::vector<std::string> messages = {1'024, "Message...ASD ASD AS DA ASD"};
            for (size_t msgNumber = 0; msgNumber < messages.size(); msgNumber++) {
                ImGui::SeparatorText(std::to_string(messages.size() - msgNumber).c_str());
                ImGui::BulletText("%s", messages[msgNumber].c_str());
            }
        }
        ImGui::EndChild();
        */

        ImGui::End();
    }

} // namespace VSBloom::Debug
#endif // defined(DEBUG_WINDOW_ENABLED)
