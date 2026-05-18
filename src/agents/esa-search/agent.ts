import * as dotenv from "dotenv";
import { EsaClient } from "../../externals/esa/client";
import { loadGoogleCloudConfig } from "../../util/config";
import { createEsaSearchAgent } from "./agent-factory";

// Entry point for debugging the esa search agent with adk-web.
dotenv.config();

const googleCloudConfig = loadGoogleCloudConfig();

const esaClient = new EsaClient({
	apiKey: process.env.ESA_API_KEY || "",
	team: process.env.ESA_TEAM_NAME || "",
});

export const rootAgent = createEsaSearchAgent({
	esaClient,
	...googleCloudConfig,
});
