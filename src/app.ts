import { App, type LogLevel } from "@slack/bolt";
import * as dotenv from "dotenv";
import express from "express";
import { EsaClient } from "./externals/esa/client";
import { AppHomeOpenedHandler } from "./handlers/app-home-opended";
import { AppMentionHandler } from "./handlers/app-mention";
import registerListeners from "./listeners";
import { handleLogger } from "./middleware";
import { EsaService } from "./services/esa-service";
import { GeminiAnswerService } from "./services/gemini-answer-service";
import { JSONConsoleLogger } from "./util/logger";

dotenv.config();

const logLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
const app = new App({
	token: process.env.SLACK_BOT_TOKEN,
	socketMode: true,
	appToken: process.env.SLACK_APP_TOKEN,
});

if (process.env.LOG_FORMAT === "json") {
	app.logger = new JSONConsoleLogger();
}
app.logger.setLevel(logLevel);
app.logger.setName("esa-slack-assistant");

const esaClient = new EsaClient({
	apiKey: process.env.ESA_API_KEY || "",
	team: process.env.ESA_TEAM_NAME || "",
});

const geminiAnswerService = new GeminiAnswerService({
	project: process.env.GOOGLE_CLOUD_PROJECT_ID || "",
	location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
	model: process.env.GOOGLE_GEMINI_MODEL || "gemini-2.5-flash",
});

const esaService = new EsaService(esaClient);

const appHomeOpenedHandler = new AppHomeOpenedHandler();
const appMentionHandler = new AppMentionHandler(
	esaClient,
	esaService,
	geminiAnswerService,
);

registerListeners(app, appHomeOpenedHandler, appMentionHandler);

// health check endpoint for Google Cloud Run or other container platforms
const httpApp = express();
httpApp.get("/healthz", (_, res) => res.status(200).send("ok"));

const port = process.env.PORT || 8080;
const host = process.env.HOSTNAME || "0.0.0.0";
(async () => {
	try {
		app.logger.info({ msg: `http server starting on port ${port}` });
		app.logger.debug("debug mode on");
		httpApp.listen(port as number, host, async () => {
			app.use(handleLogger);
			await app.start();
			app.logger.info({ msg: "esa-assistant is running on websocket mode" });
		});
	} catch (error) {
		app.logger.error({ msg: "unable to start app", error: error });
	}
})();
