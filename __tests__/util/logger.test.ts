import { LogLevel as AdkLogLevel } from "@google/adk";
import { LogLevel, type Logger } from "@slack/bolt";
import { AdkLoggerAdapter } from "../../src/util/adk-logger-adapter";

function makeLogger(): Logger {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		setLevel: vi.fn(),
		getLevel: vi.fn(() => LogLevel.INFO),
		setName: vi.fn(),
	};
}

describe("AdkLoggerAdapter", () => {
	it("delegates ADK log levels to the Slack logger methods", () => {
		const logger = makeLogger();
		const adapter = new AdkLoggerAdapter(logger);

		adapter.log(AdkLogLevel.DEBUG, "debug", { value: 1 });
		adapter.log(AdkLogLevel.INFO, "info");
		adapter.log(AdkLogLevel.WARN, "warn");
		adapter.log(AdkLogLevel.ERROR, "error");

		expect(logger.debug).toHaveBeenCalledWith("debug", { value: 1 });
		expect(logger.info).toHaveBeenCalledWith("info");
		expect(logger.warn).toHaveBeenCalledWith("warn");
		expect(logger.error).toHaveBeenCalledWith("error");
	});

	it("maps ADK log levels to Slack log levels", () => {
		const logger = makeLogger();
		const adapter = new AdkLoggerAdapter(logger);

		adapter.setLogLevel(AdkLogLevel.DEBUG);
		adapter.setLogLevel(AdkLogLevel.INFO);
		adapter.setLogLevel(AdkLogLevel.WARN);
		adapter.setLogLevel(AdkLogLevel.ERROR);

		expect(logger.setLevel).toHaveBeenNthCalledWith(1, LogLevel.DEBUG);
		expect(logger.setLevel).toHaveBeenNthCalledWith(2, LogLevel.INFO);
		expect(logger.setLevel).toHaveBeenNthCalledWith(3, LogLevel.WARN);
		expect(logger.setLevel).toHaveBeenNthCalledWith(4, LogLevel.ERROR);
	});
});
