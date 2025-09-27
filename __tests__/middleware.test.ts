import { handleLogger } from "../src/middleware";

describe("handleLogger", () => {
	const makeLogger = () => ({ info: jest.fn() });

	it("logs event trigger, channel and user after next resolves", async () => {
		const logger = makeLogger();
		const context = { userId: "U123" } as any;
		const body = { event: { type: "app_mention", channel: "C456" } } as any;
		const next = jest.fn(async () => Promise.resolve());

		await handleLogger({ context, logger: logger as any, next, body } as any);

		expect(logger.info).toHaveBeenCalledTimes(1);
		const arg = (logger.info as jest.Mock).mock.calls[0][0];
		expect(arg).toEqual(
			expect.objectContaining({
				msg: "handled request",
				trigger: "event,app_mention",
				channel: "C456",
				user: "U123",
			}),
		);
		expect(typeof arg.duration).toBe("number");
	});

	it("logs correct trigger for action payloads", async () => {
		const logger = makeLogger();
		const context = { userId: "U999" } as any;
		const body = { action: {}, type: "block_actions" } as any; // note: singular 'action' per implementation
		const next = jest.fn(async () => {});

		await handleLogger({ context, logger: logger as any, next, body } as any);

		expect(logger.info).toHaveBeenCalledTimes(1);
		const arg = (logger.info as jest.Mock).mock.calls[0][0];
		expect(arg).toEqual(
			expect.objectContaining({
				msg: "handled request",
				trigger: "action,block_actions",
				user: "U999",
			}),
		);
		expect(arg.channel).toBeUndefined();
		expect(typeof arg.duration).toBe("number");
	});

	it("logs correct trigger for command payloads", async () => {
		const logger = makeLogger();
		const context = { userId: "Ucmd" } as any;
		const body = { command: {}, type: "/hello" } as any;
		const next = jest.fn(async () => {});

		await handleLogger({ context, logger: logger as any, next, body } as any);

		const arg = (logger.info as jest.Mock).mock.calls[0][0];
		expect(arg).toEqual(
			expect.objectContaining({ trigger: "command,/hello", user: "Ucmd" }),
		);
	});

	it("logs correct trigger for shortcut payloads", async () => {
		const logger = makeLogger();
		const context = { userId: "Ushort" } as any;
		const body = { shortcut: {}, type: "message_action" } as any;
		const next = jest.fn(async () => {});

		await handleLogger({ context, logger: logger as any, next, body } as any);

		const arg = (logger.info as jest.Mock).mock.calls[0][0];
		expect(arg).toEqual(
			expect.objectContaining({
				trigger: "shortcut,message_action",
				user: "Ushort",
			}),
		);
	});

	it("logs correct trigger for view payloads", async () => {
		const logger = makeLogger();
		const context = { userId: "Uview" } as any;
		const body = { view: {}, type: "view_submission" } as any;
		const next = jest.fn(async () => {});

		await handleLogger({ context, logger: logger as any, next, body } as any);

		const arg = (logger.info as jest.Mock).mock.calls[0][0];
		expect(arg).toEqual(
			expect.objectContaining({
				trigger: "view,view_submission",
				user: "Uview",
			}),
		);
	});

	it("falls back to 'unknown' trigger when body shape doesn't match", async () => {
		const logger = makeLogger();
		const context = { userId: "Uunk" } as any;
		const body = {} as any;
		const next = jest.fn(async () => {});

		await handleLogger({ context, logger: logger as any, next, body } as any);

		const arg = (logger.info as jest.Mock).mock.calls[0][0];
		expect(arg).toEqual(
			expect.objectContaining({ trigger: "unknown", user: "Uunk" }),
		);
	});

	it("still logs even when next throws (finally block) and rethrows the error", async () => {
		const logger = makeLogger();
		const context = { userId: "Uerr" } as any;
		const body = { event: { type: "any", channel: "Cerr" } } as any;
		const next = jest.fn(async () => {
			throw new Error("boom");
		});

		await expect(
			handleLogger({ context, logger: logger as any, next, body } as any),
		).rejects.toThrow("boom");

		expect(logger.info).toHaveBeenCalledTimes(1);
		const arg = (logger.info as jest.Mock).mock.calls[0][0];
		expect(arg).toEqual(
			expect.objectContaining({
				trigger: "event,any",
				channel: "Cerr",
				user: "Uerr",
			}),
		);
	});
});
