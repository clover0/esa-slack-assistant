import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { buildAppHomeTabView } from "../ui/app-home-tab";

type AppHomeOpened = AllMiddlewareArgs &
	SlackEventMiddlewareArgs<"app_home_opened">;

export class AppHomeOpenedHandler {
	async handle({ client, event, logger }: AppHomeOpened) {
		logger.info({
			handler: "AppHomeOpenedHandler",
			user: event.user,
			tab: event.tab,
		});

		// ignore if not home tab
		if (event.tab !== "home") return;

		try {
			await client.views.publish({
				user_id: event.user,
				view: {
					type: "home",
					blocks: buildAppHomeTabView(),
				},
			});
		} catch (err: any) {
			logger.error({ handler: "AppHomeOpenedHandler", error: err });

			await client.views.publish({
				user_id: event.user,
				view: {
					type: "home",
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: ":warning: Homeの読み込み中にエラーが発生しました。",
							},
						},
						{ type: "divider" },
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: "時間をおいて再度お試しください。改善しない場合は管理者にお問い合わせください。",
							},
						},
					],
				},
			});

			throw err;
		}
	}
}
