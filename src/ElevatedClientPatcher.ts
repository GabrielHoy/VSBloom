import * as ClientPatcher from "./ClientPatcher";

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("[VSBloom]: ElevatedClientPatcher's process was not provided with the action to perform and the path to the main application product file as arguments(?)");
    process.exit(1);
}

const action = args[0];
const mainAppProductFilePath = args[1];

if (action === "patch") {
    if (args.length < 3) {
        console.error("[VSBloom]: ElevatedClientPatcher's process was not provided with the desired suppression state of the client corruption warning as an argument(?)");
        process.exit(1);
    }
    const suppressClientCorruptWarning = args[2] === "true";

    ClientPatcher.PerformClientPatching(mainAppProductFilePath, suppressClientCorruptWarning).then(() => {
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
}