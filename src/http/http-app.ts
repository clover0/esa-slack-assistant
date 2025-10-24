import express, { type Express } from "express";
import type { SocketState } from "../readiness";
import { buildLivenessBody, isDisconnectedTooLong } from "../readiness";

export interface BuildHttpAppOptions {
	state: SocketState;
	graceMs: number;
}

export function buildHttpApp({ state, graceMs }: BuildHttpAppOptions): Express {
	const httpApp = express();

	httpApp.get("/healthz", (_, res) => {
		res.status(200).send("ok");
	});

	// reflect Slack socket connectivity with grace period
	httpApp.get("/liveness", (_req, res) => {
		const disconnectedTooLong = isDisconnectedTooLong(state, graceMs);
		const status = disconnectedTooLong ? 503 : 200;
		res.status(status).json(buildLivenessBody(state, graceMs, status === 200));
	});

	return httpApp;
}
