import {
	buildLivenessBody,
	createInitialSocketState,
	isDisconnectedTooLong,
	markConnected,
	markDisconnected,
	type SocketState,
} from "../src/readiness";

describe("readiness utilities", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("createInitialSocketState returns a disconnected baseline state", () => {
		const now = 1700000000000;
		jest.spyOn(Date, "now").mockReturnValue(now);

		const state = createInitialSocketState();

		expect(state.connected).toBe(false);
		expect(state.lastConnectedAt).toBeUndefined();
		expect(state.lastDisconnectedAt).toBe(now);
		expect(state.consecutiveFailures).toBe(0);
	});

	it("markConnected flips flags, sets lastConnectedAt, and resets failures", () => {
		const connectedAt = 1700000005000;
		const state: SocketState = {
			connected: false,
			lastDisconnectedAt: 1700000004000,
			consecutiveFailures: 3,
		};
		jest.spyOn(Date, "now").mockReturnValue(connectedAt);

		markConnected(state);

		expect(state.connected).toBe(true);
		expect(state.lastConnectedAt).toBe(connectedAt);
		expect(state.consecutiveFailures).toBe(0);
		expect(state.lastDisconnectedAt).toBe(1700000004000);
	});

	it("markDisconnected flips flags, updates lastDisconnectedAt, and increments failures", () => {
		const disconnectedAt = 1700000010000;
		const state: SocketState = {
			connected: true,
			lastConnectedAt: 1700000009000,
			lastDisconnectedAt: 1700000008000,
			consecutiveFailures: 2,
		};
		jest.spyOn(Date, "now").mockReturnValue(disconnectedAt);

		markDisconnected(state);

		expect(state.connected).toBe(false);
		expect(state.lastDisconnectedAt).toBe(disconnectedAt);
		expect(state.consecutiveFailures).toBe(3);
		expect(state.lastConnectedAt).toBe(1700000009000);
	});

	describe("isDisconnectedTooLong", () => {
		it("returns false when currently connected regardless of timestamps", () => {
			const state: SocketState = {
				connected: true,
				lastConnectedAt: 10,
				lastDisconnectedAt: 1,
				consecutiveFailures: 0,
			};
			const result = isDisconnectedTooLong(state, 1000, 5000);
			expect(result).toBe(false);
		});

		it("returns false if lastDisconnectedAt is undefined", () => {
			const state: SocketState = {
				connected: false,
				lastConnectedAt: 10,
				lastDisconnectedAt: undefined,
				consecutiveFailures: 0,
			};
			const result = isDisconnectedTooLong(state, 1000, 5000);
			expect(result).toBe(false);
		});

		it("returns false if the disconnection duration is within grace period", () => {
			const state: SocketState = {
				connected: false,
				lastDisconnectedAt: 10000,
				consecutiveFailures: 1,
			};
			const now = 10500; // 500ms after disconnection
			const grace = 1000;

			expect(isDisconnectedTooLong(state, grace, now)).toBe(false);
		});

		it("returns true if the disconnection duration exceeds grace period", () => {
			const state: SocketState = {
				connected: false,
				lastDisconnectedAt: 10000,
				consecutiveFailures: 2,
			};
			const now = 11100; // 1100ms after disconnection
			const grace = 1000;

			expect(isDisconnectedTooLong(state, grace, now)).toBe(true);
		});
	});

	it("buildLivenessBody reflects state and nullifies undefined timestamps", () => {
		const state: SocketState = {
			connected: false,
			lastConnectedAt: undefined,
			lastDisconnectedAt: undefined,
			consecutiveFailures: 5,
		};

		const body = buildLivenessBody(state, 1000, false);

		expect(body).toEqual({
			ok: false,
			connected: false,
			lastConnectedAt: null,
			lastDisconnectedAt: null,
			consecutiveFailures: 5,
			graceMs: 1000,
		});
	});

	it("buildLivenessBody preserves provided timestamps when present", () => {
		const state: SocketState = {
			connected: true,
			lastConnectedAt: 2222,
			lastDisconnectedAt: 1111,
			consecutiveFailures: 0,
		};

		const body = buildLivenessBody(state, 777, true);

		expect(body).toEqual({
			ok: true,
			connected: true,
			lastConnectedAt: "1970-01-01T00:00:02.222Z",
			lastDisconnectedAt: "1970-01-01T00:00:01.111Z",
			consecutiveFailures: 0,
			graceMs: 777,
		});
	});
});
