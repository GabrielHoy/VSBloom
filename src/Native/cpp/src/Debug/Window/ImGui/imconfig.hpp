/**
 * Extra/Custom ImGui functions that are not part of the official ImGui library,
 * used for niceties & QOL while writing the VSBloom Debug Window.
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

struct ImVec2;
struct ImVec4;
struct ImGuiStyle;

namespace ImGui {

    float  GetButtonSize();
    ImVec2 GetButtonSizeVec();
    void   CenteredText(const char* text);
    void   CenteredTextColored(ImVec4 textColor, const char* text);
    float  SameLineRightSide(float objectSizeOffsetFromRight);
    void   StyleTrueDark(ImGuiStyle* dst);

    void HelpMarker(const char* desc);
    void ExplanationMarker(const char* desc);
    void ColoredHelpMarker(ImVec4 textColor, const char* desc);

} // namespace ImGui

#endif // defined(DEBUG_WINDOW_ENABLED)