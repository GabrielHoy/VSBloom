import * as os from "node:os";
import * as child_process from "child_process";

const isWin = os.platform() === "win32";

export function HasElevation(): boolean {
    if (isWin) {
        try {
            child_process.execSync("net session", { stdio: "ignore" });
            return true;
        } catch {
            return false;
        }
    } else {
        if (!process.getuid) {
            return false;
        }
        return process.getuid() === 0 || !!process.env.SUDO_UID;
    }
}