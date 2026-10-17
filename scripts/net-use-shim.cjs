/*
 * Local dev/build helper for restricted Windows environments (e.g. DSH sandbox).
 *
 * Vite 8 calls `exec("net use")` on Windows to detect mapped network drives.
 * In environments where spawning child processes with piped stdio is blocked
 * (spawn EPERM), that call throws synchronously and breaks config loading.
 * The network-drive check is only an optimization, so feeding it an empty
 * result is safe.
 */
const childProcess = require('node:child_process');
const { PassThrough } = require('node:stream');

const realExec = childProcess.exec;

childProcess.exec = function exec(command, options, callback) {
	if (typeof command === 'string' && /^\s*net(\.exe)?\s+use\b/i.test(command)) {
		const cb = typeof options === 'function' ? options : callback;
		if (cb) process.nextTick(() => cb(null, '', ''));
		const fake = new PassThrough();
		fake.kill = () => {};
		fake.unref = () => {};
		return fake;
	}
	return realExec.apply(this, arguments);
};

childProcess.exec[Symbol.for('nodejs.original')] = realExec;
