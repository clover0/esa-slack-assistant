import type { App } from "@slack/bolt";
import type { AppHomeOpenedHandler } from "../handlers/app-home-opended";
import type { AppMentionHandler } from "../handlers/app-mention";
import type { ReactionAddedHandler } from "../handlers/reaction-added";

const registerListeners = (
	app: App,
	appHomeOpenedHandler: AppHomeOpenedHandler,
	appMentionHandler: AppMentionHandler,
	reactionAddedHandler: ReactionAddedHandler,
) => {
	app.event(
		"app_home_opened",
		appHomeOpenedHandler.handle.bind(appHomeOpenedHandler),
	);
	app.event("app_mention", appMentionHandler.handle.bind(appMentionHandler));
	app.event(
		"reaction_added",
		reactionAddedHandler.handle.bind(reactionAddedHandler),
	);
};

export default registerListeners;
