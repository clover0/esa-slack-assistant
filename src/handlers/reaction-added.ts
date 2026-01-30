import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ChatHistory } from "../dto/chat-history";
import type { EsaClient } from "../externals/esa/client";
import type { AnswerService } from "../services/answer-service";
import type { EsaService } from "../services/esa-service";
import { merge } from "../util/array";
import { formatJP } from "../util/date";

type ReactionAdded = AllMiddlewareArgs &
	SlackEventMiddlewareArgs<"reaction_added">;

export class ReactionAddedHandler {
	constructor(
		private readonly esaClient: EsaClient,
		private readonly esaService: EsaService,
		private readonly answerService: AnswerService,
		private readonly targetReaction: string = "esa",
	) {}

	async handle({ client, event, logger, context }: ReactionAdded) {
		try {
			if (event.reaction !== this.targetReaction) {
				return;
			}

			if (event.item.type !== "message") {
				return;
			}

			try {
				const userInfo = await client.users.info({ user: event.user });
				if (
					userInfo.user?.is_restricted ||
					userInfo.user?.is_ultra_restricted
				) {
					logger.info({
						msg: "ignoring reaction from restricted user",
						user: event.user,
					});
					return;
				}
			} catch (err) {
				logger.warn({
					msg: "failed to fetch user info; skipping reaction",
					user: event.user,
					error: err,
				});
				return;
			}

			const channel = event.item.channel;
			const messageTs = event.item.ts;

			logger.info({
				msg: "esa reaction detected",
				channel,
				messageTs,
				user: event.user,
			});

			const channelInfo = await client.conversations.info({ channel });
			if (channelInfo.channel?.is_shared) {
				logger.info({
					msg: "ignoring reaction from externally shared channel",
				});
				return;
			}

			const threadReplies = await client.conversations.replies({
				channel,
				ts: messageTs,
			});

			const messages = threadReplies.messages ?? [];
			if (messages.length === 0) {
				logger.info({ msg: "no messages found for reaction thread" });
				return;
			}

			const threadTs = messages[0].thread_ts ?? messages[0].ts;
			if (!threadTs) {
				logger.info({ msg: "could not determine thread ts" });
				return;
			}

			const processingMsg = await client.chat.postMessage({
				channel,
				thread_ts: threadTs,
				text: "記事を作成中です...:writing_hand:",
			});

			const replies = await client.conversations.replies({
				channel,
				ts: threadTs,
			});

			const threadMessages = replies.messages ?? [];
			const conversation = this.buildConversation(
				threadMessages,
				context.botId,
			);

			const conversationSummary = conversation
				.map((c) => `[${c.role}]: ${c.text}`)
				.join("\n");

			const now = new Date();

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
					userQuestion: conversationSummary,
					now,
				}),
				this.answerService.generateKeywords({
					categories: categoryPathsOnly,
					userQuestion: conversationSummary,
					now,
				}),
			]);

			logger.debug({
				msg: "selected categories for article",
				categories: targetCategories.join(","),
			});

			const [collectedPosts, searchedPosts] = await Promise.all([
				this.esaService.collectPostsByCategories(targetCategories),
				this.esaService.searchPostsByKeywords(searchKeywords),
			]);

			const existingPosts = merge(
				collectedPosts,
				searchedPosts,
				(x) => x.number,
			);

			logger.info({ msg: "existing posts found", count: existingPosts.length });

			const duplicateResult = await this.answerService.checkDuplicate({
				posts: existingPosts,
				conversationSummary,
				now,
			});

			if (duplicateResult.isDuplicate && duplicateResult.matchedPost) {
				let responseText = `この記事がカバーしてそうです: ${duplicateResult.matchedPost.url}`;

				if (
					duplicateResult.additionalInfo &&
					duplicateResult.additionalInfo.length > 0
				) {
					responseText += `\n\nスレッドの会話には以下の追加情報がありそうです:\n${duplicateResult.additionalInfo.map((info) => `- ${info}`).join("\n")}\n\n記事への追記を検討してください。`;
				}

				await client.chat.update({
					channel,
					ts: processingMsg.ts!,
					text: responseText,
				});

				logger.info({
					msg: "duplicate found",
					matchedPostId: duplicateResult.matchedPost.number,
				});
				return;
			}

			const selectedCategory =
				targetCategories.length > 0 ? targetCategories[0] : undefined;

			const generatedArticle = await this.answerService.generateArticle({
				conversation,
				category: selectedCategory,
				now,
			});

			logger.info({
				msg: "article generated",
				title: generatedArticle.title,
				tags: generatedArticle.tags,
			});

			const createdPost = await this.esaClient.createPost({
				name: generatedArticle.title,
				body_md: generatedArticle.body,
				tags: generatedArticle.tags,
				category: selectedCategory,
				wip: true,
				message: "Created from Slack conversation by esa-slack-assistant",
			});

			await client.chat.update({
				channel,
				ts: processingMsg.ts!,
				text: `下書きを作成しました: ${createdPost.url}`,
			});

			logger.info({
				msg: "article created",
				postNumber: createdPost.number,
				url: createdPost.url,
			});
		} catch (err: any) {
			logger.error({ msg: "error handling reaction", error: err });

			if (event.item.type === "message") {
				try {
					const threadReplies = await client.conversations.replies({
						channel: event.item.channel,
						ts: event.item.ts,
					});
					const messages = threadReplies.messages ?? [];
					const threadTs = messages[0]?.thread_ts ?? messages[0]?.ts;

					if (threadTs) {
						await client.chat.postMessage({
							channel: event.item.channel,
							thread_ts: threadTs,
							text: `記事の作成中にエラーが発生しました。\n${err.message || err}`,
						});
					}
				} catch (postErr) {
					logger.error({ msg: "failed to post error message", error: postErr });
				}
			}
		}
	}

	private buildConversation(messages: any[], botId?: string): ChatHistory[] {
		return messages.map((m): ChatHistory => {
			const timestamp = m.ts
				? formatJP(new Date(parseFloat(m.ts) * 1000))
				: "unknown time";
			const isAssistant = botId ? m.bot_id === botId : Boolean(m.bot_id);
			return {
				role: isAssistant ? "assistant" : "user",
				text: m.text ? `${m.text}\nfrom ${m.user} at ${timestamp}` : "",
			};
		});
	}
}
