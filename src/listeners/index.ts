import type { App } from "@slack/bolt";
import type { AppHomeOpenedHandler } from "../handlers/app-home-opended";
import type { AppMentionHandler } from "../handlers/app-mention";

const registerListeners = (
	app: App,
	appHomeOpenedHandler: AppHomeOpenedHandler,
	appMentionHandler: AppMentionHandler,
) => {
	app.event(
		"app_home_opened",
		appHomeOpenedHandler.handle.bind(appHomeOpenedHandler),
	);
	app.event("app_mention", appMentionHandler.handle.bind(appMentionHandler));
};

export default registerListeners;
