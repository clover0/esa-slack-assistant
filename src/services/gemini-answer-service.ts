import {
	type BaseAgent,
	type Event,
	InMemoryRunner,
	isFinalResponse,
	stringifyContent,
} from "@google/adk";
import { createUserContent } from "@google/genai";
import type { Chunk } from "../dto/chunk";
import { formatJP } from "../util/date";
import type {
	AnswerQuestionParams,
	QuestionAnswerService,
} from "./answer-service";

type AgentFactory = () => BaseAgent | Promise<BaseAgent>;

type GeminiAnswerServiceConfig = {
	agentFactory: AgentFactory;
	appName?: string;
};

const maxLlmCalls = 50;

export class GeminiAnswerService implements QuestionAnswerService {
	private readonly agentFactory: AgentFactory;
	private readonly appName: string;

	constructor(config: GeminiAnswerServiceConfig) {
		this.agentFactory = config.agentFactory;
		this.appName = config.appName ?? "esa-search";
	}

	async answerQuestion({
		question,
		history,
		now,
	}: AnswerQuestionParams): Promise<AsyncGenerator<Chunk>> {
		const runner = new InMemoryRunner({
			agent: await this.agentFactory(),
			appName: this.appName,
		});

		const events = runner.runEphemeral({
			userId: "slack-user",
			newMessage: createUserContent(
				this.buildUserMessage({
					question,
					history,
					now,
				}),
			),
			runConfig: {
				maxLlmCalls,
			},
		});

		return this.mapEventsToChunks(events);
	}

	private buildUserMessage({
		question,
		history,
		now,
	}: {
		question: string;
		history?: { role: "user" | "assistant"; text: string }[];
		now: Date;
	}) {
		const historyText =
			history && history.length > 0
				? history.map((h) => `[${h.role}]: ${h.text}`).join("\n\n")
				: "なし";

		return `# 現在日時
${formatJP(now)}

# Slack会話文脈
${historyText}

# ユーザーの入力
${question}`;
	}

	private async *mapEventsToChunks(
		events: AsyncIterable<Event>,
	): AsyncGenerator<Chunk> {
		let finalText = "";
		let totalTokenCount: number | undefined;

		for await (const event of events) {
			if (event.errorCode) {
				throw new Error(event.errorMessage ?? event.errorCode);
			}

			if (!isFinalResponse(event)) {
				continue;
			}

			const text = stringifyContent(event).trim();
			if (text) {
				finalText = text;
			}
			if (typeof event.usageMetadata?.totalTokenCount === "number") {
				totalTokenCount = event.usageMetadata.totalTokenCount;
			}
		}

		if (!finalText) {
			throw new Error("Empty response from ADK agent");
		}

		yield { textDelta: finalText };
		yield { totalTokenCount };
	}
}
