/**
 * IPC Methods
 *
 * Provides forward-declarations for the various methods
 * that are available for IPC-related functionality,
 * triggerable by a message being sent from the parent process.
 */

#pragma once

#include "../IPCSendables.hpp"
#include <functional>
#include <nlohmann/json.hpp>
#include <optional>
#include <string>
#include <unordered_map>

namespace VSBloom::IPC {

    /**
     * Direct type alias to `nlohmann::json`.
     *
     * Represents a general-purpose JSON object.
     *
     * No promises are made as to the structure or contents of this JSON object
     * whatsoever by this type alias, only that it is a valid JSON object.
     */
    using json_t = nlohmann::json;
    /**
     * Direct type alias to `std::string`.
     *
     * Represents the name of an IPC method that the parent process
     * can invoke on the Native Runtime to run its associated handler.
     */
    using methodName_t = std::string;
    /**
     * An optionally specified IPCSendable object, every IPC method handler
     * should return either an IPCSendable-compatible object or `std::nullopt`
     * if they do not wish to send a response back to the parent process.
     */
    using methodResponse_t = std::optional<IPCSendable>;
    /**
     * A JSON object that represents the request data sent from the parent process
     * to the Native Runtime when an IPC method is invoked.
     *
     * This is the data that the method handler will receive as its first - and only - argument
     * when it is invoked by the parent process.
     */
    using methodRequest_t = json_t;
    /**
     * A function that takes in a JSON object which represents the request data sent from the parent process
     * to the Native Runtime when an IPC method is invoked, and returns an optionally-specified JSON object
     * which represents the response that the method wishes to send back to the parent process - if any.
     */
    using methodHandler_t = std::function<methodResponse_t(const methodRequest_t& message)>;
    /**
     * A map of method names to their corresponding handler functions.
     */
    using methodHandlerMap_t = std::unordered_map<methodName_t, methodHandler_t>;

    /**
     * A map of IPC method names to their corresponding request handler functions.
     *
     * Each handler function is expected to take a single argument - the
     * message object sent from the parent process - and return one of two things:
     * - `std::nullopt`, if the method does not have any response that it wants to
     *      send back to the parent process.
     * - A JSON object, which is the response that the method wishes to communicate
     *      to the parent process invoking the method on the Native Runtime.
     *
     * Responses returned by the handler function will be sent back to the parent
     * process as a binary NDJSON blob containing the response JSON object wrapped
     * in a small envelope denoting that it is a response to whatever method name
     * was called by the parent process on the Native Runtime.
     *
     * Serialization is handled for you as long as you pass sane JSON objects
     * which actually contain serializable primitive values which can be converted
     * to an appropriate (ND)JSON representation.
     *
     */
    extern methodHandlerMap_t methodRequestHandlers;

} // namespace VSBloom::IPC