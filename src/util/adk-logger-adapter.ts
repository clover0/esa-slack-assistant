import {
	LogLevel as AdkLogLevel,
	type Logger as AdkLogger,
} from "@google/adk";
import type { Logger } from "@slack/bolt";
import { LogLevel } from "@slack/bolt";

export class AdkLoggerAdapter implements AdkLogger {
	public constructor(private readonly logger: Logger) {}

	public log(level: AdkLogLevel, ...msg: unknown[]): void {
		switch (level) {
			case AdkLogLevel.DEBUG:
				this.debug(...msg);
				return;
			case AdkLogLevel.INFO:
				this.info(...msg);
				return;
			case AdkLogLevel.WARN:
				this.warn(...msg);
				return;
			case AdkLogLevel.ERROR:
				this.error(...msg);
				return;
		}
	}

	public debug(...msg: unknown[]): void {
		this.logger.debug(...msg);
	}

	public info(...msg: unknown[]): void {
		this.logger.info(...msg);
	}

	public warn(...msg: unknown[]): void {
		this.logger.warn(...msg);
	}

	public error(...msg: unknown[]): void {
		this.logger.error(...msg);
	}

	public setLogLevel(level: AdkLogLevel): void {
		this.logger.setLevel(toSlackLogLevel(level));
	}
}

function toSlackLogLevel(level: AdkLogLevel): LogLevel {
	switch (level) {
		case AdkLogLevel.DEBUG:
			return LogLevel.DEBUG;
		case AdkLogLevel.INFO:
			return LogLevel.INFO;
		case AdkLogLevel.WARN:
			return LogLevel.WARN;
		case AdkLogLevel.ERROR:
			return LogLevel.ERROR;
	}
}
