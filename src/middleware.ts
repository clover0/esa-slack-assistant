import type { AnyMiddlewareArgs, Middleware, StringIndexed } from "@slack/bolt";

export const handleLogger: Middleware<
	AnyMiddlewareArgs,
	StringIndexed
> = async ({ context, logger, next, body }) => {
	const startTime = Date.now();

	try {
		await next();
	} finally {
		let trigger = "unknown";
		let channel: string | undefined;
		const user = context.userId;

		if ("event" in body) {
			const event = body as { event: { type: string; channel: string } };
			trigger = `event,${event.event.type}`;
			channel = event.event.channel;
		}

		if ("action" in body) {
			trigger = `action,${body.type}`;
		}

		if ("command" in body) {
			trigger = `command,${body.type}`;
		}

		if ("shortcut" in body) {
			trigger = `shortcut,${body.type}`;
		}

		if ("view" in body) {
			trigger = `view,${body.type}`;
		}

		const executeTime = Date.now() - startTime;
		logger.info({
			msg: "handled request",
			trigger,
			duration: executeTime,
			channel,
			user,
		});
	}
};
