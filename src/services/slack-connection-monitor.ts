import type { App } from "@slack/bolt";
import type { SocketState } from "../readiness";
import { markConnected, markDisconnected } from "../readiness";

export interface SlackConnectionMonitor {
	stop: () => void;
}

export interface StartSlackConnectionMonitorOptions {
	app: App;
	state: SocketState;
	intervalMs: number;
	token?: string;
}

export function startSlackConnectionMonitor({
	app,
	state,
	intervalMs,
	token,
}: StartSlackConnectionMonitorOptions): SlackConnectionMonitor {
	let timer: NodeJS.Timeout | undefined;

	const doPing = async () => {
		try {
			await app.client.auth.test({ token });
			markConnected(state);
		} catch (e) {
			markDisconnected(state);
			app.logger.warn({
				msg: "slack ping failed",
				consecutiveFailures: state.consecutiveFailures,
				error: e,
			});
		}
	};

	timer = setInterval(doPing, intervalMs);
	void doPing();

	return {
		stop: () => {
			if (timer) clearInterval(timer);
		},
	};
}
