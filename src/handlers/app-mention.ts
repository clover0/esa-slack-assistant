import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ChatHistory } from "../dto/chat-history";
import type { QuestionAnswerService } from "../services/answer-service";
import { loadingMessageBlock } from "../ui/app-mention";
import { formatJP } from "../util/date";

type AppMention = AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">;

export class AppMentionHandler {
	constructor(private readonly questionAnswerService: QuestionAnswerService) {}

	async handle({ context, client, event, logger }: AppMention) {
		let totalTokenCount: number | undefined;

		try {
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

			const channelInfo = await client.conversations.info({
				channel: event.channel,
			});

			if (channelInfo.channel?.is_shared) {
				logger.info({ msg: "ignoring message from externally shared channel" });
				await client.chat.postMessage({
					channel: event.channel,
					thread_ts: event.ts,
					text: `外部と共有しているチャンネルでは利用できません。`,
				});
				return;
			}

			if (event.thread_ts) {
				const resp = await this.respondInThread({
					context,
					client,
					event,
					logger,
				} as AppMention);
				totalTokenCount = resp.totalTokenCount;
			} else {
				const resp = await this.respondToNewThread({
					context,
					client,
					event,
					logger,
				} as AppMention);
				totalTokenCount = resp.totalTokenCount;
			}
		} catch (err: any) {
			await client.chat.postMessage({
				channel: event.channel,
				thread_ts: event.ts,
				text: `エラーが発生しました。\n${err}`,
			});
			logger.error(err);
		} finally {
			logger.info({ msg: "end handle", totalTokenCount });
		}
	}

	private async respondToNewThread({ client, event }: AppMention) {
		const now = new Date();

		const first = await client.chat.postMessage({
			channel: event.channel,
			thread_ts: event.ts,
			text: "記事を探しています...:hourglass_flowing_sand:",
			blocks: [loadingMessageBlock()],
		});

		const streamer = client.chatStream({
			channel: event.channel,
			thread_ts: event.ts,
			recipient_team_id: event.team,
			recipient_user_id: event.user,
		});

		try {
			const response = await this.questionAnswerService.answerQuestion({
				question: event.text,
				now,
			});
			let totalTokenCount: number | undefined;
			for await (const message of response) {
				await streamer.append({ markdown_text: message.textDelta ?? "" });
				totalTokenCount = message.totalTokenCount;
			}

			await client.chat.delete({ channel: event.channel, ts: first.ts ?? "" });

			return { totalTokenCount };
		} finally {
			await streamer.stop();
		}
	}

	private async respondInThread({ client, event, context }: AppMention) {
		const now = new Date();
		const first = await client.chat.postMessage({
			channel: event.channel,
			thread_ts: event.thread_ts,
			text: "記事を探しています...:hourglass_flowing_sand:",
			blocks: [loadingMessageBlock()],
		});

		const streamer = client.chatStream({
			channel: event.channel,
			thread_ts: event.ts,
			recipient_team_id: event.team,
			recipient_user_id: event.user,
		});

		try {
			const replies = await client.conversations.replies({
				channel: event.channel,
				ts: event.thread_ts ? event.thread_ts : "",
			});

			const replyTexts: ChatHistory[] = (replies.messages ?? []).map(
				(m): ChatHistory => {
					const timestamp = m.ts
						? formatJP(new Date(parseFloat(m.ts) * 1000))
						: "unknown time";
					const isAssistant = context.botId
						? m.bot_id === context.botId
						: Boolean(m.bot_id);
					return {
						role: isAssistant ? "assistant" : "user",
						text: m.text ? `${m.text}\nfrom ${m.user} at ${timestamp}` : "",
					};
				},
			);

			const response = await this.questionAnswerService.answerQuestion({
				question: event.text,
				history: replyTexts,
				now,
			});

			let totalTokenCount: number | undefined;
			for await (const message of response) {
				await streamer.append({ markdown_text: message.textDelta ?? "" });
				totalTokenCount = message.totalTokenCount;
			}

			await client.chat.delete({ channel: event.channel, ts: first.ts ?? "" });

			return { totalTokenCount };
		} finally {
			await streamer.stop();
		}
	}
}
