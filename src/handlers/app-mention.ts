import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ChatHistory } from "../dto/chat-history";
import type { EsaClient } from "../externals/esa/client";
import type { AnswerService } from "../services/answer-service";
import type { EsaService } from "../services/esa-service";

type AppMention = AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">;

export class AppMentionHandler {
	constructor(
		private readonly esaClient: EsaClient,
		private readonly esaService: EsaService,
		private readonly answerService: AnswerService,
	) {}

	async handle({ context, client, event, logger }: AppMention) {
		logger.info({
			msg: "start handle",
			handler: "AppMentionHandler",
			channel: event.channel,
			user: event.user,
		});

		if (
			event.user_profile?.is_restricted ||
			event.user_profile?.is_ultra_restricted
		) {
			// Ignore messages from restricted users (e.g., guests)
			logger.info({ msg: "ignoring message from restricted user" });
			await client.chat.postMessage({
				channel: event.channel,
				thread_ts: event.ts,
				text: `ゲストの方は利用できないようにしています。`,
			});
			return;
		}

		try {
			if (event.thread_ts) {
				await this.respondInThread({
					context,
					client,
					event,
					logger,
				} as AppMention);

				return;
			}

			await this.respondToNewThread({
				context,
				client,
				event,
				logger,
			} as AppMention);
		} catch (err: any) {
			await client.chat.postMessage({
				channel: event.channel,
				thread_ts: event.ts,
				text: `エラーが発生しました。\n${err}`,
			});
			logger.error(err);
		}

		logger.info({ msg: "end handle" });
	}

	private async respondToNewThread({ client, event }: AppMention) {
		const first = await client.chat.postMessage({
			channel: event.channel,
			thread_ts: event.ts,
			text: ":hourglass_flowing_sand:...",
		});

		const categories = await this.esaClient.getCategories(
			{},
			{ excludeArchive: true },
		);
		const targetCategories = await this.answerService.selectCategory(
			categories.categories
				.filter((c) => !!c)
				.map((c) => `${c.path} ${c.posts}`),
			event.text,
		);

		const posts =
			await this.esaService.collectPostsByCategories(targetCategories);
		const response = await this.answerService.answerQuestion(posts, event.text);
		let returnText = "";
		for await (const message of response) {
			returnText += message.textDelta;
			await client.chat.update({
				channel: event.channel,
				ts: first.message?.ts || "",
				markdown_text: returnText,
			});
		}
	}

	private async respondInThread({ client, event }: AppMention) {
		const msg = await client.chat.postMessage({
			channel: event.channel,
			thread_ts: event.thread_ts,
			text: ":hourglass_flowing_sand:...",
		});

		const replies = await client.conversations.replies({
			channel: event.channel,
			ts: event.thread_ts ? event.thread_ts : "",
		});

		const replyTexts: ChatHistory[] = (replies.messages ?? []).map(
			(m): ChatHistory => ({
				role: m.bot_id ? "assistant" : "user",
				text: m.text ?? "",
			}),
		);

		const categories = await this.esaClient.getCategories(
			{},
			{ excludeArchive: true },
		);

		const targetCategories = await this.answerService.selectCategory(
			categories.categories.filter((c) => !!c).map((c) => c.path),
			event.text,
		);

		const posts =
			await this.esaService.collectPostsByCategories(targetCategories);

		const response = await this.answerService.answerQuestion(
			posts,
			event.text,
			replyTexts,
		);
		let returnText = "";
		for await (const message of response) {
			returnText += message.textDelta;
			await client.chat.update({
				channel: event.channel,
				ts: msg.message?.ts || "",
				markdown_text: returnText,
			});
		}
	}
}
