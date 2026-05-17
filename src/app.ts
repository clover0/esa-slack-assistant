import { App } from "@slack/bolt";
import * as dotenv from "dotenv";
import { createEsaSearchAgent } from "./agents/esa-search";
import { EsaClient } from "./externals/esa/client";
import { AppHomeOpenedHandler } from "./handlers/app-home-opended";
import { AppMentionHandler } from "./handlers/app-mention";
import { ReactionAddedHandler } from "./handlers/reaction-added";
import { buildHttpApp } from "./http/http-app";
import registerListeners from "./listeners";
import { handleLogger } from "./middleware";
import {
	createInitialSocketState,
	markConnected,
	markDisconnected,
	type SocketState,
} from "./readiness";
import type { QuestionAnswerService } from "./services/answer-service";
import { EsaService } from "./services/esa-service";
import { GeminiAnswerService } from "./services/gemini-answer-service";
import { GeminiArticleService } from "./services/gemini-article-service";
import { startSlackConnectionMonitor } from "./services/slack-connection-monitor";
import { loadConfig, loadGoogleCloudConfig } from "./util/config";
import { JSONConsoleLogger } from "./util/logger";

dotenv.config();

const config = loadConfig();
const googleCloudConfig = loadGoogleCloudConfig();

const socketState: SocketState = createInitialSocketState();

const app = new App({
	token: process.env.SLACK_BOT_TOKEN,
	socketMode: true,
	appToken: process.env.SLACK_APP_TOKEN,
	clientOptions: {
		// keep Slack API calls short to avoid blocking readiness
		timeout: 10000,
	},
});

if (config.logFormat === "json") {
	app.logger = new JSONConsoleLogger();
}
app.logger.setLevel(config.logLevel);
app.logger.setName("esa-slack-assistant");

const esaClient = new EsaClient({
	apiKey: process.env.ESA_API_KEY || "",
	team: process.env.ESA_TEAM_NAME || "",
});

const geminiArticleService = new GeminiArticleService(googleCloudConfig);

const esaService = new EsaService(esaClient);

const httpApp = buildHttpApp({
	state: socketState,
	graceMs: config.readinessGraceMs,
});

let monitor = undefined as undefined | { stop: () => void };

(async () => {
	try {
		app.logger.debug("debug mode on");
		app.logger.info({ msg: `http server starting on port ${config.port}` });

		const questionAnswerService: QuestionAnswerService =
			new GeminiAnswerService({
				agentFactory: async () => {
					const categoryPromptEntries = await loadCategoryPromptEntries();

					return createEsaSearchAgent({
						esaClient,
						...googleCloudConfig,
						categoryPromptEntries,
						logger: app.logger,
					});
				},
			});

		const appHomeOpenedHandler = new AppHomeOpenedHandler();
		const appMentionHandler = new AppMentionHandler(questionAnswerService);
		const reactionAddedHandler = new ReactionAddedHandler(
			esaClient,
			esaService,
			geminiArticleService,
			process.env.ESA_AUTOGEN_TRIGGER_REACTION || "esa",
		);

		registerListeners(
			app,
			appHomeOpenedHandler,
			appMentionHandler,
			reactionAddedHandler,
		);

		app.use(handleLogger);

		httpApp.listen(config.port as number, config.host, async () => {
			try {
				await app.start();
				markConnected(socketState);
				app.logger.info({ msg: "running on websocket mode" });
			} catch (startErr) {
				markDisconnected(socketState);
				app.logger.error({
					msg: "unable to start socket mode",
					error: startErr,
				});
			}

			monitor = startSlackConnectionMonitor({
				app,
				state: socketState,
				intervalMs: config.slackPingIntervalMs,
				token: process.env.SLACK_BOT_TOKEN,
			});
		});
	} catch (error) {
		app.logger.error({ msg: "unable to start app", error: error });
	}
})();

async function loadCategoryPromptEntries() {
	try {
		const { categories } = await esaClient.getCategories({});
		app.logger.info({
			msg: "loaded esa categories for agent prompt",
			categoryCount: categories.length,
		});
		return categories.map((category) => ({
			path: category.path,
			posts: category.posts,
		}));
	} catch (error) {
		app.logger.warn({
			msg: "failed to load esa categories for agent prompt",
			error,
		});
		return [];
	}
}

const shutdown = async (signal: string) => {
	try {
		app.logger.info({ msg: `received ${signal}, shutting down` });
		if (monitor) monitor.stop();
		await app.stop();
		process.exit(0);
	} catch (e) {
		app.logger.error({ msg: "error during shutdown", error: e });
		process.exit(1);
	}
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
