import type { Logger } from "@slack/bolt";
import { LogLevel } from "@slack/bolt";

// reference from:https://github.com/slackapi/node-slack-sdk/blob/4b8bfecff24bc80c36ab2537138617b5aca5a9d7/packages/logger/src/index.ts
export class JSONConsoleLogger implements Logger {
	/** Setting for level */
	private level: LogLevel;

	/** Name */
	private name: string;

	/** Map of severity as comparable numbers for each log level */
	private static severity: { [key in LogLevel]: number } = {
		[LogLevel.ERROR]: 400,
		[LogLevel.WARN]: 300,
		[LogLevel.INFO]: 200,
		[LogLevel.DEBUG]: 100,
	};

	public constructor() {
		this.level = LogLevel.INFO;
		this.name = "";
	}

	public getLevel(): LogLevel {
		return this.level;
	}

	/**
	 * Sets the instance's log level so that only messages which are equal or more severe are output to the console.
	 */
	public setLevel(level: LogLevel): void {
		this.level = level;
	}

	/**
	 * Set the instance's name, which will appear on each log line before the message.
	 */
	public setName(name: string): void {
		this.name = name;
	}

	/**
	 * Log a debug message
	 */
	// biome-ignore lint/suspicious/noExplicitAny: can log anything
	public debug(...msg: any[]): void {
		if (JSONConsoleLogger.isMoreOrEqualSevere(LogLevel.DEBUG, this.level)) {
			console.debug(
				JSON.stringify({
					level: LogLevel.DEBUG,
					name: this.name,
					content: msg.length === 1 ? msg[0] : msg,
				}),
			);
		}
	}

	/**
	 * Log an info message
	 */
	// biome-ignore lint/suspicious/noExplicitAny: can log anything
	public info(...msg: any[]): void {
		if (JSONConsoleLogger.isMoreOrEqualSevere(LogLevel.INFO, this.level)) {
			console.info(
				JSON.stringify({
					level: LogLevel.INFO,
					name: this.name,
					content: msg.length === 1 ? msg[0] : msg,
				}),
			);
		}
	}

	/**
	 * Log a warning message
	 */
	// biome-ignore lint/suspicious/noExplicitAny: can log anything
	public warn(...msg: any[]): void {
		if (JSONConsoleLogger.isMoreOrEqualSevere(LogLevel.WARN, this.level)) {
			console.warn(
				JSON.stringify({
					level: LogLevel.WARN,
					name: this.name,
					content: msg.length === 1 ? msg[0] : msg,
				}),
			);
		}
	}

	/**
	 * Log an error message
	 */
	// biome-ignore lint/suspicious/noExplicitAny: can log anything
	public error(..._msg: any[]): void {
		if (JSONConsoleLogger.isMoreOrEqualSevere(LogLevel.ERROR, this.level)) {
			const msg = _msg.map((v) =>
				v instanceof Error
					? { name: v.name, message: v.message, stack: v.stack }
					: v,
			);
			console.error(
				JSON.stringify({
					level: LogLevel.ERROR,
					name: this.name,
					content: msg.length === 1 ? msg[0] : msg,
				}),
			);
		}
	}

	/**
	 * Helper to compare two log levels and determine if a is equal or more severe than b
	 */
	private static isMoreOrEqualSevere(a: LogLevel, b: LogLevel): boolean {
		return JSONConsoleLogger.severity[a] >= JSONConsoleLogger.severity[b];
	}
}
