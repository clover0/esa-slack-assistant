import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ChatHistory } from "../dto/chat-history";
import type { Post } from "../dto/post";
import type { EsaClient } from "../externals/esa/client";
import type { AnswerService } from "../services/answer-service";
import type { EsaService } from "../services/esa-service";
import { merge } from "../util/array";
import { formatJP } from "../util/date";

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

		let totalTokenCount: number | undefined;
		try {
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

	private async respondToNewThread({ client, event, logger }: AppMention) {
		const now = new Date();
		const first = await client.chat.postMessage({
			channel: event.channel,
			thread_ts: event.ts,
			text: ":hourglass_flowing_sand:...",
		});

		const mergedPosts = await this.buildMergedPosts({
			text: event.text,
			logger: logger,
			now,
		});

		const response = await this.answerService.answerQuestion({
			posts: mergedPosts,
			question: event.text,
			now,
		});
		let totalTokenCount: number | undefined;
		let returnText = "";
		for await (const message of response) {
			returnText += message.textDelta ?? "";
			await client.chat.update({
				channel: event.channel,
				ts: first.message?.ts || "",
				markdown_text: returnText,
			});
			totalTokenCount = message.totalTokenCount;
		}

		return { totalTokenCount };
	}

	private async respondInThread({ client, event, logger }: AppMention) {
		const now = new Date();
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
			(m): ChatHistory => {
				const timestamp = m.ts
					? formatJP(new Date(parseFloat(m.ts) * 1000))
					: "unknown time";
				return {
					role: m.bot_id ? "assistant" : "user",
					text: m.text ? `${m.text}\nfrom ${m.user} at ${timestamp}` : "",
				};
			},
		);

		const mergedPosts = await this.buildMergedPosts({
			text: event.text,
			logger: logger,
			history: replyTexts,
			now: now,
		});

		const response = await this.answerService.answerQuestion({
			posts: mergedPosts,
			question: event.text,
			history: replyTexts,
			now,
		});

		let totalTokenCount: number | undefined;
		let returnText = "";

		for await (const message of response) {
			returnText += message.textDelta ?? "";
			await client.chat.update({
				channel: event.channel,
				ts: msg.message?.ts || "",
				markdown_text: returnText,
			});
			totalTokenCount = message.totalTokenCount;
		}

		return { totalTokenCount };
	}

	private async buildMergedPosts({
		text,
		logger,
		history,
		now,
	}: {
		text: string;
		logger: any;
		history?: ChatHistory[];
		now: Date;
	}): Promise<Post[]> {
		const { categories } = await this.esaClient.getCategories(
			{},
			{ excludeArchive: true },
		);

		const categoryWithCounts = categories
			.filter((c) => !!c)
			.map((c) => `${c.path} ${c.posts}`);
		const categoryPathsOnly = categories.map((c) => c.path);
		const [targetCategories, searchKeywords] = await Promise.all([
			this.answerService.selectCategory({
				categories: categoryWithCounts,
				userQuestion: text,
				history,
				now,
			}),
			this.answerService.generateKeywords({
				categories: categoryPathsOnly,
				userQuestion: text,
				history,
				now,
			}),
		]);

		logger.debug({
			msg: "selected categories",
			categories: targetCategories.join(","),
		});
		logger.debug({
			msg: "generated keywords",
			keywords: searchKeywords.join(","),
		});

		const [collectedPosts, searchedPosts] = await Promise.all([
			this.esaService.collectPostsByCategories(targetCategories),
			this.esaService.searchPostsByKeywords(searchKeywords),
		]);

		const mergedPosts = merge(collectedPosts, searchedPosts, (x) => x.number);
		logger.info({ msg: "searched posts", length: mergedPosts.length });

		return mergedPosts;
	}
}
