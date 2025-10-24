export interface SocketState {
	connected: boolean;
	lastConnectedAt?: number;
	lastDisconnectedAt?: number;
	consecutiveFailures: number;
}

export function createInitialSocketState(): SocketState {
	return {
		connected: false,
		lastConnectedAt: undefined,
		lastDisconnectedAt: Date.now(),
		consecutiveFailures: 0,
	};
}

export function markConnected(state: SocketState): void {
	state.connected = true;
	state.lastConnectedAt = Date.now();
	state.consecutiveFailures = 0;
}

export function markDisconnected(state: SocketState): void {
	state.connected = false;
	state.lastDisconnectedAt = Date.now();
	state.consecutiveFailures += 1;
}

export function isDisconnectedTooLong(
	state: SocketState,
	graceMs: number,
	now: number = Date.now(),
): boolean {
	return !state.connected && state.lastDisconnectedAt !== undefined
		? now - state.lastDisconnectedAt > graceMs
		: false;
}

export function buildLivenessBody(
	state: SocketState,
	graceMs: number,
	ok: boolean,
) {
	return {
		ok,
		connected: state.connected,
		lastConnectedAt:
			state.lastConnectedAt !== undefined
				? new Date(state.lastConnectedAt).toISOString()
				: null, // null for JSON
		lastDisconnectedAt:
			state.lastDisconnectedAt !== undefined
				? new Date(state.lastDisconnectedAt).toISOString()
				: null, // null for JSON
		consecutiveFailures: state.consecutiveFailures,
		graceMs,
	};
}
