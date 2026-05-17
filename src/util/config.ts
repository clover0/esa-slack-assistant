import type { LogLevel } from "@slack/bolt";

export interface AppConfig {
	logLevel: LogLevel;
	logFormat: "json" | "text";
	port: number | string;
	host: string;
	readinessGraceMs: number;
	slackPingIntervalMs: number;
}

export interface GoogleCloudConfig {
	project: string;
	location: string;
	model: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	return {
		logLevel: (env.LOG_LEVEL ?? "info") as LogLevel,
		logFormat: env.LOG_FORMAT === "json" ? "json" : "text",
		port: env.PORT || 8080,
		host: env.HOSTNAME || "0.0.0.0",
		readinessGraceMs: Number.parseInt(env.READINESS_GRACE_MS || "20000", 10),
		slackPingIntervalMs: Number.parseInt(
			env.SLACK_PING_INTERVAL_MS || "5000",
			10,
		),
	};
}

export function loadGoogleCloudConfig(
	env: NodeJS.ProcessEnv = process.env,
): GoogleCloudConfig {
	return {
		project: env.GOOGLE_CLOUD_PROJECT_ID || "",
		location: env.GOOGLE_CLOUD_LOCATION || "global",
		model: env.GOOGLE_GEMINI_MODEL || "gemini-3-flash-preview",
	};
}
