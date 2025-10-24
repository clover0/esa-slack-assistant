import type { App } from "@slack/bolt";
import {
	createInitialSocketState,
	type SocketState,
} from "../../src/readiness";
import { startSlackConnectionMonitor } from "../../src/services/slack-connection-monitor";

describe("slack-connection-monitor", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	function buildFakeApp() {
		return {
			client: {
				auth: {
					test: jest.fn(),
				},
			},
			logger: {
				warn: jest.fn(),
			},
		} as unknown as App;
	}

	it("pings immediately on start and at interval; marks connected on success", async () => {
		const app = buildFakeApp();
		const state: SocketState = {
			...createInitialSocketState(),
			consecutiveFailures: 2,
		};

		(app.client.auth.test as jest.Mock).mockResolvedValue({ ok: true });

		const monitor = startSlackConnectionMonitor({
			app,
			state,
			intervalMs: 1000,
			token: "xoxb-token",
		});

		await Promise.resolve();

		expect(app.client.auth.test).toHaveBeenCalledTimes(1);
		expect(app.client.auth.test).toHaveBeenLastCalledWith({
			token: "xoxb-token",
		});
		expect(state.connected).toBe(true);
		expect(state.consecutiveFailures).toBe(0);

		jest.advanceTimersByTime(1000);

		await Promise.resolve();

		expect(app.client.auth.test).toHaveBeenCalledTimes(2);

		monitor.stop();
	});

	it("marks disconnected and logs warn on failure, including incremented failures", async () => {
		const app = buildFakeApp();
		const state = createInitialSocketState();

		state.connected = true;
		state.consecutiveFailures = 1;

		const error = new Error("network");
		(app.client.auth.test as jest.Mock).mockRejectedValue(error);

		const monitor = startSlackConnectionMonitor({
			app,
			state,
			intervalMs: 500,
		});

		await Promise.resolve();

		expect(state.connected).toBe(false);
		expect(state.consecutiveFailures).toBe(2);

		jest.advanceTimersByTime(500);

		await Promise.resolve();

		expect(state.consecutiveFailures).toBe(3);

		monitor.stop();
	});

	it("stop() clears interval and prevents further pings", async () => {
		const app = buildFakeApp();
		const state = createInitialSocketState();
		(app.client.auth.test as jest.Mock).mockResolvedValue({ ok: true });

		const monitor = startSlackConnectionMonitor({
			app,
			state,
			intervalMs: 200,
		});

		await Promise.resolve();

		expect(app.client.auth.test).toHaveBeenCalledTimes(1);

		monitor.stop();

		jest.advanceTimersByTime(1000);
		await Promise.resolve();

		expect(app.client.auth.test).toHaveBeenCalledTimes(1);
	});
});
