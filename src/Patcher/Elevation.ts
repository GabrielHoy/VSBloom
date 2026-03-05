import * as childProcess from 'node:child_process';
import * as os from 'node:os';

const isWin = os.platform() === 'win32';

export function HasElevation(): boolean {
	if (isWin) {
		try {
			childProcess.execSync('net session', { stdio: 'ignore' });
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
