import type { App } from "@slack/bolt";
import {
	createInitialSocketState,
	type SocketState,
} from "../../src/readiness";
import { startSlackConnectionMonitor } from "../../src/services/slack-connection-monitor";

describe("slack-connection-monitor", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function buildFakeApp() {
		const authTest = vi.fn();
		const warn = vi.fn();

		const app = {
			client: {
				auth: {
					test: authTest,
				},
			},
			logger: {
				warn,
			},
		} as unknown as App;

		return { app, authTest, warn };
	}

	it("pings immediately on start and at interval; marks connected on success", async () => {
		const { app, authTest } = buildFakeApp();
		const state: SocketState = {
			...createInitialSocketState(),
			consecutiveFailures: 2,
		};

		authTest.mockResolvedValue({ ok: true });

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

		await vi.advanceTimersByTimeAsync(1000);

		expect(authTest).toHaveBeenCalledTimes(2);

		monitor.stop();
	});

	it("marks disconnected and logs warn on failure, including incremented failures", async () => {
		const { app, authTest } = buildFakeApp();
		const state = createInitialSocketState();

		state.connected = true;
		state.consecutiveFailures = 1;

		const error = new Error("network");
		authTest.mockRejectedValue(error);

		const monitor = startSlackConnectionMonitor({
			app,
			state,
			intervalMs: 500,
		});

		await Promise.resolve();

		expect(state.connected).toBe(false);
		expect(state.consecutiveFailures).toBe(2);

		await vi.advanceTimersByTimeAsync(500);

		expect(state.consecutiveFailures).toBe(3);

		monitor.stop();
	});

	it("stop() clears interval and prevents further pings", async () => {
		const { app, authTest } = buildFakeApp();
		const state = createInitialSocketState();
		authTest.mockResolvedValue({ ok: true });

		const monitor = startSlackConnectionMonitor({
			app,
			state,
			intervalMs: 200,
		});

		await Promise.resolve();

		expect(app.client.auth.test).toHaveBeenCalledTimes(1);

		monitor.stop();

		await vi.advanceTimersByTimeAsync(1000);

		expect(authTest).toHaveBeenCalledTimes(1);
	});
});
