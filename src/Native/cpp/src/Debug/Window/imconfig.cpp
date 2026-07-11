#if defined(DEBUG_WINDOW_ENABLED)

    #include "imconfig.hpp"
    #include "imgui.h"
    #include <cmath>

namespace ImGui {

    void HelpMarker(const char* desc) {
        ImGui::TextDisabled("(?)");
        if (ImGui::BeginItemTooltip()) {
            ImGui::PushTextWrapPos(ImGui::GetFontSize() * 35.0f);
            ImGui::TextUnformatted(desc);
            ImGui::PopTextWrapPos();
            ImGui::EndTooltip();
        }
    }

    void ColoredHelpMarker(ImVec4 textColor, const char* desc) {
        ImGui::TextColored(textColor, "(?)");
        if (ImGui::BeginItemTooltip()) {
            ImGui::PushTextWrapPos(ImGui::GetFontSize() * 35.0f);
            ImGui::TextUnformatted(desc);
            ImGui::PopTextWrapPos();
            ImGui::EndTooltip();
        }
    }

    void ExplanationMarker(const char* desc) {
        ImGui::ColoredHelpMarker(ImVec4(1.f, 1.f, 1.f, 0.4f), desc);
    }

    void SeparatorWidth(float width) {
        ImGui::Dummy(ImVec2(0.f, 1.f + ImGui::GetStyle().ItemSpacing.y));
        ImGui::GetWindowDrawList()->AddLine(
            ImVec2(
                ImGui::GetCursorScreenPos().x + (ImGui::GetWindowWidth() / 2) - (width / 2),
                ImGui::GetCursorScreenPos().y
            ),
            ImVec2(
                ImGui::GetCursorScreenPos().x + (ImGui::GetWindowWidth() / 2) + (width / 2),
                ImGui::GetCursorScreenPos().y
            ),
            ImGui::GetColorU32(ImGuiCol_Separator),
            1.0f
        );
        ImGui::Dummy(ImVec2(0.f, 1.f + ImGui::GetStyle().ItemSpacing.y));
    }

    void SeparatorWidth(float startAtX, float width) {
        ImGui::Dummy(ImVec2(0.f, 1.f + ImGui::GetStyle().ItemSpacing.y));
        ImGui::GetWindowDrawList()->AddLine(
            ImVec2(startAtX, ImGui::GetCursorScreenPos().y),
            ImVec2(startAtX + width, ImGui::GetCursorScreenPos().y),
            ImGui::GetColorU32(ImGuiCol_Separator),
            1.0f
        );
        ImGui::Dummy(ImVec2(0.f, 1.f + ImGui::GetStyle().ItemSpacing.y));
    }

    void CenteredText(const char* text) {
        ImVec2 textSize = ImGui::CalcTextSize(text);
        ImGui::SetCursorPosX(ImGui::GetCursorPosX() + (ImGui::GetContentRegionAvail().x / 2.f) - (textSize.x / 2.f));
        ImGui::Text("%s", text);
    }

    void CenteredTextColored(ImVec4 textColor, const char* text) {
        ImVec2 textSize = ImGui::CalcTextSize(text);
        ImGui::SetCursorPosX(ImGui::GetCursorPosX() + (ImGui::GetContentRegionAvail().x / 2.f) - (textSize.x / 2.f));
        ImGui::TextColored(textColor, "%s", text);
    }

    float SameLineRightSide(float objectSizeOffsetFromRight) {
        float availDrawingWidth = ImGui::GetWindowContentRegionMax().x;          // ImGui::GetWindowWidth();
        float newCursorX        = availDrawingWidth - objectSizeOffsetFromRight; // - style.ItemSpacing.x;
        ImGui::SameLine(newCursorX);
        return newCursorX;
    }

    float GetButtonSize() {
        return std::floor(ImGui::GetFontSize() * 1.5f);
    }

    ImVec2 GetButtonSizeVec() {
        return ImVec2(GetButtonSize(), GetButtonSize());
    }

    void StyleColorsTrueDark(ImGuiStyle* dst) {
        ImGuiStyle* style = dst ? dst : &ImGui::GetStyle();

        ImVec4* colors                             = style->Colors;
        colors[ImGuiCol_Text]                      = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_TextDisabled]              = ImVec4(0.35f, 0.35f, 0.35f, 1.00f);
        colors[ImGuiCol_WindowBg]                  = ImVec4(0.00f, 0.00f, 0.00f, 1.00f);
        colors[ImGuiCol_ChildBg]                   = ImVec4(0.00f, 0.00f, 0.00f, 0.00f);
        colors[ImGuiCol_PopupBg]                   = ImVec4(0.08f, 0.08f, 0.08f, 0.94f);
        colors[ImGuiCol_Border]                    = ImVec4(1.00f, 1.00f, 1.00f, 0.69f);
        colors[ImGuiCol_BorderShadow]              = ImVec4(0.00f, 0.00f, 0.00f, 0.00f);
        colors[ImGuiCol_FrameBg]                   = ImVec4(0.00f, 0.00f, 0.00f, 1.00f);
        colors[ImGuiCol_FrameBgHovered]            = ImVec4(0.29f, 0.29f, 0.29f, 0.40f);
        colors[ImGuiCol_FrameBgActive]             = ImVec4(0.60f, 0.60f, 0.60f, 0.67f);
        colors[ImGuiCol_TitleBg]                   = ImVec4(0.075f, 0.075f, 0.075f, 1.00f);
        colors[ImGuiCol_TitleBgActive]             = ImVec4(0.00f, 0.00f, 0.00f, 1.00f);
        colors[ImGuiCol_TitleBgCollapsed]          = ImVec4(0.00f, 0.00f, 0.00f, 0.29f);
        colors[ImGuiCol_MenuBarBg]                 = ImVec4(0.10f, 0.10f, 0.10f, 1.00f);
        colors[ImGuiCol_ScrollbarBg]               = ImVec4(0.04f, 0.04f, 0.04f, 0.53f);
        colors[ImGuiCol_ScrollbarGrab]             = ImVec4(0.33f, 0.33f, 0.33f, 1.00f);
        colors[ImGuiCol_ScrollbarGrabHovered]      = ImVec4(0.64f, 0.64f, 0.64f, 1.00f);
        colors[ImGuiCol_ScrollbarGrabActive]       = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_CheckMark]                 = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_SliderGrab]                = ImVec4(1.00f, 1.00f, 1.00f, 0.58f);
        colors[ImGuiCol_SliderGrabActive]          = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_Button]                    = ImVec4(0.16f, 0.16f, 0.16f, 1.00f);
        colors[ImGuiCol_ButtonHovered]             = ImVec4(0.38f, 0.38f, 0.38f, 1.00f);
        colors[ImGuiCol_ButtonActive]              = ImVec4(0.62f, 0.62f, 0.62f, 1.00f);
        colors[ImGuiCol_Header]                    = ImVec4(0.25f, 0.25f, 0.25f, 1.00f);
        colors[ImGuiCol_HeaderHovered]             = ImVec4(0.46f, 0.46f, 0.46f, 0.80f);
        colors[ImGuiCol_HeaderActive]              = ImVec4(0.59f, 0.59f, 0.59f, 1.00f);
        colors[ImGuiCol_Separator]                 = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_SeparatorHovered]          = ImVec4(1.00f, 1.00f, 1.00f, 0.66f);
        colors[ImGuiCol_SeparatorActive]           = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_ResizeGrip]                = ImVec4(1.00f, 1.00f, 1.00f, 0.30f);
        colors[ImGuiCol_ResizeGripHovered]         = ImVec4(1.00f, 1.00f, 1.00f, 0.61f);
        colors[ImGuiCol_ResizeGripActive]          = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_InputTextCursor]           = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_TabHovered]                = ImVec4(0.15f, 0.15f, 0.15f, 1.00f);
        colors[ImGuiCol_Tab]                       = ImVec4(0.25f, 0.25f, 0.25f, 1.00f);
        colors[ImGuiCol_TabSelected]               = ImVec4(0.00f, 0.00f, 0.00f, 1.00f);
        colors[ImGuiCol_TabSelectedOverline]       = ImVec4(1.00f, 1.00f, 1.00f, 1.00f);
        colors[ImGuiCol_TabDimmedSelected]         = ImVec4(0.02f, 0.02f, 0.02f, 1.f);
        colors[ImGuiCol_TabDimmed]                 = ImVec4(0.25f, 0.25f, 0.25f, 1.00f);
        colors[ImGuiCol_TabDimmedSelectedOverline] = ImVec4(0.125f, 0.125f, 0.125f, 0.00f);
        colors[ImGuiCol_FrameBg]                   = ImVec4(0.10f, 0.10f, 0.10f, 1.00f);
        colors[ImGuiCol_PlotLines]                 = ImVec4(0.61f, 0.61f, 0.61f, 1.00f);
        colors[ImGuiCol_PlotLinesHovered]          = ImVec4(1.00f, 0.43f, 0.35f, 1.00f);
        colors[ImGuiCol_PlotHistogram]             = ImVec4(0.90f, 0.70f, 0.00f, 1.00f);
        colors[ImGuiCol_PlotHistogramHovered]      = ImVec4(1.00f, 0.60f, 0.00f, 1.00f);
        colors[ImGuiCol_TableHeaderBg]             = ImVec4(0.19f, 0.19f, 0.20f, 0.00f);
        colors[ImGuiCol_TableBorderStrong]         = ImVec4(0.5f, 0.00f, 0.0f, 1.00f);
        colors[ImGuiCol_TableBorderLight]          = ImVec4(0.05f, 0.05f, 0.05f, 1.00f);
        colors[ImGuiCol_TableRowBg]                = ImVec4(0.00f, 0.00f, 0.00f, 0.00f);
        colors[ImGuiCol_TableRowBgAlt]             = ImVec4(1.00f, 1.00f, 1.00f, 0.06f);
        colors[ImGuiCol_TextLink]                  = ImVec4(0.26f, 0.59f, 0.98f, 1.00f);
        colors[ImGuiCol_TextSelectedBg]            = ImVec4(0.26f, 0.59f, 0.98f, 0.35f);
        colors[ImGuiCol_DragDropTarget]            = ImVec4(1.00f, 1.00f, 0.00f, 0.90f);
        colors[ImGuiCol_NavCursor]                 = ImVec4(0.26f, 0.59f, 0.98f, 1.00f);
        colors[ImGuiCol_NavWindowingHighlight]     = ImVec4(1.00f, 1.00f, 1.00f, 0.70f);
        colors[ImGuiCol_NavWindowingDimBg]         = ImVec4(0.80f, 0.80f, 0.80f, 0.20f);
        colors[ImGuiCol_ModalWindowDimBg]          = ImVec4(0.80f, 0.80f, 0.80f, 0.35f);
    }

    void StyleTrueDark(ImGuiStyle* dst) {
        ImGuiStyle* style = dst ? dst : &ImGui::GetStyle();

        style->WindowBorderSize        = 0.f;
        style->FrameBorderSize         = 1.f;
        style->TabBarBorderSize        = 1.f;
        style->SeparatorTextBorderSize = 1.f;

        style->FrameRounding     = 0.f;
        style->WindowRounding    = 0.f;
        style->GrabRounding      = 0.f;
        style->ChildRounding     = 0.f;
        style->ScrollbarRounding = 0.f;
        style->TabRounding       = 0.f;

        style->ButtonTextAlign    = ImVec2(0.5f, 0.5f);
        style->WindowTitleAlign   = ImVec2(0.5f, 0.5f);
        style->SeparatorTextAlign = ImVec2(0.5f, 0.5f);

        style->ItemSpacing = ImVec2(5.0f, 4.5f);

        style->WindowPadding    = ImVec2(8.0f, 8.0f);
        style->WindowRounding   = 5.0f;
        style->WindowBorderSize = 1.0f;

        StyleColorsTrueDark(dst);
    }

} // namespace ImGui

#endif