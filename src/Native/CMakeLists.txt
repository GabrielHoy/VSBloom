cmake_minimum_required(VERSION 3.25)

# CMAKE_OSX_DEPLOYMENT_TARGET *must* be set before project() so CMake selects the
# right SDK at configure time on macOS.
# This defines the minimum version of macOS that these native binaries will run on.
if(APPLE)
    set(CMAKE_OSX_DEPLOYMENT_TARGET "13.0" CACHE STRING "Minimum macOS deployment target")
endif()

# Grab the version string for CMake to use from the `vcpkg.json`
# sibling file in this directory - we'll use its value for our build
# versioning accordingly.
file(READ "${CMAKE_CURRENT_LIST_DIR}/vcpkg.json" VCPKG_JSON_RAW_CONTENT)
string(REGEX MATCH "\"version\"[ \t\r\n]*:[ \t\r\n]*\"([^\"]+)\"" _VERSTR "${VCPKG_JSON_RAW_CONTENT}")
set(VSBLOOM_NATIVE_VERSION "${CMAKE_MATCH_1}")
project(vsbloom-native
    VERSION ${VSBLOOM_NATIVE_VERSION}
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# We'll utilize sccache for caching compiler invocations to speed up rebuilds
# (If it's present on the system, that is)
find_program(SCCACHE_EXECUTABLE sccache)
if(SCCACHE_EXECUTABLE)
    message(STATUS "Utilizing sccache for compiler invocation caching")
    set(CMAKE_C_COMPILER_LAUNCHER   "${SCCACHE_EXECUTABLE}")
    set(CMAKE_CXX_COMPILER_LAUNCHER "${SCCACHE_EXECUTABLE}")
endif()

# Dependencies - vcpkg managed, check out CMakePresets.json for more details!
find_package(nlohmann_json CONFIG REQUIRED)

#Target sources
file(GLOB_RECURSE SOURCES CONFIGURE_DEPENDS "src/*.cpp")

add_executable(vsbloom-native ${SOURCES})

set_target_properties(vsbloom-native PROPERTIES OUTPUT_NAME "vsbloom-native")

target_include_directories(vsbloom-native PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(vsbloom-native PRIVATE
    nlohmann_json::nlohmann_json
)

# Platform-specific audio backend(s)
if(WIN32)
    target_compile_definitions(vsbloom-native PRIVATE
        VSBLOOM_AUDIO_BACKEND_WASAPI
        WIN32_LEAN_AND_MEAN
        NOMINMAX
        UNICODE
        _UNICODE
    )
    target_link_libraries(vsbloom-native PRIVATE
        ole32   # COM initialisation: CoInitializeEx, CoCreateInstance
        avrt    # MMCSS real-time thread priority: AvSetMmThreadCharacteristics
    )
elseif(APPLE)
    find_library(COREAUDIO_LIB CoreAudio REQUIRED)
    find_library(AUDIOTOOLBOX_LIB AudioToolbox REQUIRED)
    target_compile_definitions(vsbloom-native PRIVATE VSBLOOM_AUDIO_BACKEND_COREAUDIO)
    target_link_libraries(vsbloom-native PRIVATE ${COREAUDIO_LIB} ${AUDIOTOOLBOX_LIB})
else()
    target_compile_definitions(vsbloom-native PRIVATE VSBLOOM_AUDIO_BACKEND_PIPEWIRE)
endif()

# Hardening & Warnings
if(MSVC)
    target_compile_options(vsbloom-native PRIVATE /W4 /WX /permissive-)
else()
    target_compile_options(vsbloom-native PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

# We regenerate `.clangd` from `.clang.in` at configure time to point over to
# the `compile_commands.json` file in the build directory.
set(CLANGD_BUILD_DIR "${CMAKE_BINARY_DIR}")
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/.clangd.in
    ${CMAKE_CURRENT_SOURCE_DIR}/.clangd
    @ONLY
)

#Our binary should land within `<install-prefix>/bin/vsbloom-native[.exe]`/
install(TARGETS vsbloom-native RUNTIME DESTINATION bin)
