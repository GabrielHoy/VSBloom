/**
 * VSBloom Elevated Client Patcher
 * 
 * This script is used to perform the patching process for the
 * VSBloom extension in a elevated context, this is necessary
 * in circumstances where the VSC installation is installed
 * system-wide instead of being installed to a user directory.
 * 
 * It's unfortunate that this script is necessary since the
 * idea of patching the client will likely come off to end
 * users as a little 'sketchy' to begin with and asking for
 * process elevation won't help that much; but if we want
 * to make the modifications we need to in order to bridge
 * the extension host and the electron renderer - there is
 * no other way I have currently found for doing so besides
 * this.
 */
import * as ClientPatcher from "./ClientPatcher";

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("[VSBloom]: ElevatedClientPatcher's process was not provided with the action to perform and the path to the main application product file as arguments(?)");
    process.exit(1);
}

const action = args[0];
const mainAppProductFilePath = args[1];

if (action === "patch") {
    // expected args for patch:
    // [1] mainAppProductFilePath - string
    // [2] suppressClientCorruptWarning - boolean
    // [3] bridgePort - number
    // [4] authToken - string
    if (args.length < 6) {
        console.error("[VSBloom]: ElevatedClientPatcher's patch action requires: suppressCorruptWarning, bridgePort, authToken, and extensionPath arguments");
        process.exit(1);
    }

    const suppressClientCorruptWarning = args[2] === "true";
    const bridgePort = parseInt(args[3], 10);
    const authToken = args[4];

    if (isNaN(bridgePort)) {
        console.error("[VSBloom]: ElevatedClientPatcher's bridgePort argument is not a valid number");
        process.exit(1);
    }

    if (!authToken) {
        console.error("[VSBloom]: ElevatedClientPatcher's authToken argument is empty");
        process.exit(1);
    }

    ClientPatcher.PerformClientPatching(
        mainAppProductFilePath,
        suppressClientCorruptWarning,
        bridgePort,
        authToken
    ).then(() => {
        console.log("Patching successful");
        process.exit(0);
    }).catch(err => {
        console.error("[VSBloom]: ElevatedClientPatcher's process encountered an error during the client patching process: ", err);
        process.exit(1);
    });
} else if (action === "unpatch") {
    ClientPatcher.UnpatchClient(mainAppProductFilePath).then(() => {
        console.log("Unpatching successful");
        process.exit(0);
    }).catch(err => {
        console.error("[VSBloom]: ElevatedClientPatcher's process encountered an error during the client unpatching process: ", err);
        process.exit(1);
    });
} else {
    console.error("[VSBloom]: ElevatedClientPatcher's process was not provided with a valid action to perform(?)");
    process.exit(1);
}
