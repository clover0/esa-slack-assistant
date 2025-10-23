import {
	type ContentListUnion,
	FinishReason,
	GoogleGenAI,
	Modality,
} from "@google/genai";
import type { ChatHistory } from "../dto/chat-history";
import type { Chunk } from "../dto/chunk";
import type { Post } from "../dto/post";
import { formatJP } from "../util/date";
import { retry } from "../util/google-genai";
import type {
	AnswerQuestionParams,
	AnswerService,
	GenerateKeywordsParams,
	SelectCategoryParams,
} from "./answer-service";

const selectCategoryInstruction = ({ now }: { now: Date }) => {
	return `あなたは esa ドキュメント検索のアシスタントです。
ユーザーの質問と会話の文脈から関連する適切なカテゴリを特定して出力してください。

# 現在日時
${formatJP(now)}

# 手順
1. ユーザーの質問を正確に理解する
2. esa に存在するカテゴリの中から、関連性の高いカテゴリを最大3つまで特定する

# 出力ルール
* 出力はカテゴリ名のみ
* 各カテゴリを改行で区切る
* 余計なテキストや説明は出力しない
* 出力数は1〜3個まで
* カテゴリ一覧には、カテゴリ名とそのカテゴリに属する記事数がスペース区切りで並んでいます。

# 出力例
\`\`\`
category
category1/subcategory
category2/sub1/sub2
\`\`\`
`;
};

const generateKeywordsInstruction = ({
	userQuestion,
	now,
}: {
	userQuestion: string;
	now: Date;
}) => `あなたは esa ドキュメント検索のアシスタントです。
ユーザーの質問と会話の文脈から関連する適切なキーワードを出力してください。

# 現在日時
${formatJP(now)}

# ユーザーの質問
\`\`\`
${userQuestion}
\`\`\`

# 手順
1. 会話の文脈を把握して、ユーザーの質問を正しく理解する
2. 記事の検索で利用するためのキーワードを8個生成する。

# 出力ルール
* 出力はキーワードのみ
* 1つのキーワードは2文字以上
* キーワードは記号やスペースを使わずに出力する
* 質問から類推できるキーワード、カテゴリ一覧から類推できるキーワードを使う
* 出力はキーワードごとに1行ごとに出力する
`;

const answerQuestionInstruction = ({ now }: { now: Date }) => {
	return `あなたはナレッジシェアリングサービス「esa」の記事を利用してユーザーの質問に回答するAIアシスタントです。
ユーザーの質問に関連するドキュメントを「ドキュメント一覧」から探し、根拠とともに回答してください。

# 現在日時
${formatJP(now)}


# 手順
1. 会話の文脈を把握して、ユーザーの質問を正しく理解する
2. 「ドキュメント一覧」から質問に関連するドキュメントを検索する
3. ドキュメントをもとに回答を作成する


# ルール

必須制約:
* 「ドキュメント一覧」に含まれる情報のみを使用すること
* 一般知識や想像による補足は禁止
* ドキュメントが見つからない場合は、ドキュメントが見つからなかった旨を伝えること

回答の要件:
* 回答に使用したドキュメントのURLを必ず示すこと
* 回答の根拠として「どの部分（章・見出し・段落）」を参照したか明記すること
* 複数のドキュメントを利用する場合は、ドキュメントごとに根拠を分けて示すこと

出力形式:
* 出力はSlackに投稿できる形式にすること。
* 丁寧で分かりやすく、ユーザーがすぐ理解できる文体で書くこと
* Slackへの返信メッセージには文字制限があるため、長い文章は避けること
* 箇条書きの多用は避け、必要に応じて段落で説明すること
* マークダウン形式で出力すること

# ドキュメント一覧の構成
* ===を区切り文字として、複数のドキュメントを1つにまとめています
* title: ドキュメントのタイトル
* id: ドキュメントのid
* tags: ドキュメントのタグ一覧（カンマ区切り）
* url: ドキュメントのURL
* body: マークダウンで書かれたドキュメントをJSONエンコードした本文
* created_at: ドキュメントの作成日時
* updated_at: ドキュメントの最終更新日時
`;
};

export class GeminiAnswerService implements AnswerService {
	private ai: GoogleGenAI;
	private readonly model: string = "gemini-2.5-flash";

	constructor(config: { project: string; location: string; model?: string }) {
		this.ai = new GoogleGenAI({
			vertexai: true,
			project: config.project,
			location: config.location,
		});

		if (config.model) {
			this.model = config.model;
		}
	}

	async selectCategory({
		categories,
		userQuestion,
		history,
		now,
	}: SelectCategoryParams) {
		const contents = this.buildContents(userQuestion, history);
		console.log(contents);
		const response = await this.generateContentWithRetry({
			model: this.model,
			config: {
				temperature: 0,
				maxOutputTokens: 2048,
				systemInstruction:
					selectCategoryInstruction({ now: now ?? new Date() }) +
					this.buildCategorySection(categories),
				responseModalities: [Modality.TEXT],
			},
			contents: contents,
		});

		return this.parseLines(response.text || "");
	}

	private buildCategorySection(categories: string[]) {
		return `

# カテゴリ一覧
${categories.join("\n")}
`;
	}

	async generateKeywords({
		categories,
		userQuestion,
		history,
		now,
	}: GenerateKeywordsParams) {
		const instruction =
			generateKeywordsInstruction({ userQuestion, now }) +
			this.buildCategorySection(categories);
		const contents = this.buildContents(userQuestion, history);
		const response = await this.generateContentWithRetry({
			model: this.model,
			config: {
				temperature: 0,
				maxOutputTokens: 2048,
				systemInstruction: instruction,
				responseModalities: [Modality.TEXT],
			},
			contents: contents,
		});

		return this.parseLines(response.text || "");
	}

	private buildPostsSection(posts: Post[]) {
		const documents = posts
			.map(
				(p) => `title: ${p.name}
id: ${p.number}
tags: ${p.tags.join(",")}
url: ${p.url}
body: ${p.body_md}
created_at: ${p.created_at}
updated_at: ${p.updated_at}`,
			)
			.join("\n===\n");

		return `

# ドキュメント一覧
${documents}
`;
	}

	async answerQuestion({
		posts,
		question,
		history,
		now,
	}: AnswerQuestionParams) {
		const contents = this.buildContents(question, history);
		const stream = await this.generateContentStreamWithRetry({
			model: this.model,
			config: {
				temperature: 0,
				maxOutputTokens: 40000, // Be careful of Slack's maximum character limit for replies.
				systemInstruction:
					answerQuestionInstruction({ now }) + this.buildPostsSection(posts),
				responseModalities: [Modality.TEXT],
			},
			contents: contents,
		});

		async function* mapStream(): AsyncGenerator<Chunk> {
			let totalTokenCount: number | undefined;
			for await (const evt of stream) {
				const text = evt.text;
				totalTokenCount = evt.usageMetadata?.totalTokenCount;
				if (evt.candidates && evt.candidates.length > 0) {
					const event = evt.candidates[0];
					if (event.finishReason) {
						if (event.finishReason !== FinishReason.STOP) {
							throw new Error(
								`error on generating answer with finish-reason ${event.finishReason}`,
							);
						}
					}
				}
				if (text) {
					yield { textDelta: text };
				}
			}
			yield { totalTokenCount };
		}

		return mapStream();
	}

	private async generateContentWithRetry(
		args: any,
		maxRetries = 3,
		initialDelayMs = 1000,
	): Promise<any> {
		return retry({
			fn: () => this.ai.models.generateContent(args),
			maxRetries,
			initialDelayMs,
		});
	}

	private async generateContentStreamWithRetry(
		args: any,
		maxRetries = 3,
		initialDelayMs = 1000,
	): Promise<AsyncIterable<any>> {
		return retry({
			fn: () => this.ai.models.generateContentStream(args),
			maxRetries,
			initialDelayMs,
		});
	}

	private parseLines(text: string): string[] {
		return text
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	private buildContents(
		question: string,
		history?: ChatHistory[],
	): ContentListUnion {
		if (history && history.length > 0) {
			const contents = history.map((h) => ({
				role: h.role === "assistant" ? "model" : "user",
				parts: [{ text: h.text }],
			}));

			const lastText = history[history.length - 1]?.text ?? "";
			if (lastText.trim() !== question.trim()) {
				contents.push({
					role: "user",
					parts: [{ text: question }],
				});
			}
			return contents;
		}

		return [
			{
				role: "user",
				parts: [{ text: question }],
			},
		];
	}
}
