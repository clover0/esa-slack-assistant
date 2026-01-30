import {
	type ContentListUnion,
	FinishReason,
	GoogleGenAI,
	Modality,
	Type,
} from "@google/genai";
import type { ChatHistory } from "../dto/chat-history";
import type { Chunk } from "../dto/chunk";
import type { Post } from "../dto/post";
import { formatJP } from "../util/date";
import { retry } from "../util/google-genai";
import type {
	AnswerQuestionParams,
	AnswerService,
	CheckDuplicateParams,
	CheckDuplicateResult,
	GenerateArticleParams,
	GeneratedArticle,
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
* 出力数は1〜3個まで
* カテゴリ一覧には、カテゴリ名とそのカテゴリに属する記事数がスペース区切りで並んでいます。
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
* 1つのキーワードは2文字以上
* 質問から類推できるキーワード、カテゴリ一覧から類推できるキーワードを使う
* アルファベットのキーワードは、ユーザーの質問から推測できる一般的な表記（大文字・小文字を区別）で生成する。例えば github から GitHub を生成する
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

const checkDuplicateInstruction = ({ now }: { now: Date }) => {
	return `あなたは esa ドキュメント管理のアシスタントです。
Slackの会話内容と既存のドキュメントを比較し、重複があるかを判定してください。

# 現在日時
${formatJP(now)}

# 手順
1. 会話の要約を理解する
2. ドキュメント一覧から、会話の内容をカバーしている記事があるか確認する
3. 重複判定と追加情報の抽出を行う

# 判定基準（やや厳しめ）
* 会話の主要なトピックが既存記事で十分にカバーされている場合のみ「重複あり」と判定
* 部分的に関連しているだけでは「重複あり」としない
* 既存記事に書かれていない新しい情報が会話に含まれている場合、その情報を追加情報として抽出する
* 重複候補が複数ある場合は全て挙げる
* 重複あり/なしの判断理由を簡潔にまとめる
`;
};

const generateArticleInstruction = ({ now }: { now: Date }) => {
	return `あなたは esa ドキュメント作成のアシスタントです。
Slackの会話内容をもとに、esaの記事を作成してください。

# 現在日時
${formatJP(now)}

# 手順
1. 会話内容を分析し、主要なトピックを特定する
2. 記事のタイトル、本文、タグを生成する

# 記事作成のルール
* タイトルは簡潔で内容を表すものにする
* 本文はマークダウン形式で記述する
* 会話の内容を整理し、読みやすい形にまとめる
* 質問と回答の形式が適切な場合はQ&A形式で記述する
* 手順や設定方法の場合は番号付きリストで記述する
* タグは内容に関連するキーワードを3〜5個程度抽出する
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
		const response = await this.generateContentWithRetry({
			model: this.model,
			config: {
				temperature: 0,
				maxOutputTokens: 2048,
				systemInstruction:
					selectCategoryInstruction({ now: now ?? new Date() }) +
					this.buildCategorySection(categories),
				responseModalities: [Modality.TEXT],
				responseMimeType: "application/json",
				responseSchema: {
					type: Type.ARRAY,
					description: "関連するカテゴリ名の一覧",
					items: { type: Type.STRING },
					minItems: "1",
					maxItems: "3",
				},
			},
			contents: contents,
		});

		const jsonText = response.text?.trim();
		if (!jsonText) {
			throw new Error("Empty JSON response from Gemini");
		}
		const result = JSON.parse(jsonText);
		return Array.isArray(result)
			? result.filter((item) => typeof item === "string")
			: [];
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
				responseMimeType: "application/json",
				responseSchema: {
					type: Type.ARRAY,
					description: "検索に使うキーワード一覧",
					items: { type: Type.STRING },
					minItems: "8",
					maxItems: "8",
				},
			},
			contents: contents,
		});

		const jsonText = response.text?.trim();
		if (!jsonText) {
			throw new Error("Empty JSON response from Gemini");
		}
		const result = JSON.parse(jsonText);
		return Array.isArray(result)
			? result.filter((item) => typeof item === "string")
			: [];
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

	async checkDuplicate({
		posts,
		conversationSummary,
		now,
	}: CheckDuplicateParams): Promise<CheckDuplicateResult> {
		const response = await this.generateContentWithRetry({
			model: this.model,
			config: {
				temperature: 0,
				maxOutputTokens: 2048,
				systemInstruction:
					checkDuplicateInstruction({ now }) + this.buildPostsSection(posts),
				responseModalities: [Modality.TEXT],
				responseMimeType: "application/json",
				responseSchema: {
					type: Type.OBJECT,
					properties: {
						isDuplicate: {
							type: Type.BOOLEAN,
							description: "会話内容が既存記事で十分にカバーされているか",
						},
						matchedPostIds: {
							type: Type.ARRAY,
							description: "重複ありの場合の記事ID一覧。重複なしは空配列",
							items: { type: Type.INTEGER },
						},
						additionalInfo: {
							type: Type.ARRAY,
							description: "既存記事に含まれない追加情報。なければ空配列",
							items: { type: Type.STRING },
						},
						reason: {
							type: Type.STRING,
							description: "重複あり/なしと判断した理由",
						},
					},
					required: [
						"isDuplicate",
						"matchedPostIds",
						"additionalInfo",
						"reason",
					],
				},
			},
			contents: [
				{
					role: "user",
					parts: [
						{
							text: `以下のSlack会話の内容と、既存のドキュメントを比較してください。\n\n# 会話の要約\n${conversationSummary}`,
						},
					],
				},
			],
		});

		const jsonText = response.text?.trim();
		if (!jsonText) {
			throw new Error("Empty JSON response from Gemini");
		}
		const result = JSON.parse(jsonText);
		console.log("Gemini response:", result);

		const matchedPostIds = Array.isArray(result.matchedPostIds)
			? result.matchedPostIds
			: [];
		const matchedPostIdSet = new Set(
			matchedPostIds
				.filter((id: unknown) => typeof id === "number")
				.map((id: number) => id),
		);
		const matchedPosts =
			matchedPostIdSet.size > 0
				? posts.filter((p) => matchedPostIdSet.has(p.number))
				: undefined;

		return {
			isDuplicate: result.isDuplicate,
			matchedPosts,
			additionalInfo: Array.isArray(result.additionalInfo)
				? result.additionalInfo
				: [],
			reason: result.reason,
		};
	}

	async generateArticle({
		conversation,
		category,
		now,
	}: GenerateArticleParams): Promise<GeneratedArticle> {
		const conversationText = conversation
			.map((c) => `[${c.role}]: ${c.text}`)
			.join("\n\n");

		const categoryInstruction = category
			? `\n\n# カテゴリ\n記事は「${category}」カテゴリに作成されます。`
			: "";

		const response = await this.generateContentWithRetry({
			model: this.model,
			config: {
				temperature: 0,
				maxOutputTokens: 50000,
				systemInstruction:
					generateArticleInstruction({ now }) + categoryInstruction,
				responseModalities: [Modality.TEXT],
				responseMimeType: "application/json",
				responseSchema: {
					type: Type.OBJECT,
					properties: {
						title: {
							type: Type.STRING,
							description: "記事のタイトル",
						},
						body: {
							type: Type.STRING,
							description: "マークダウン形式の本文",
						},
						tags: {
							type: Type.ARRAY,
							description: "記事に付与するタグ一覧",
							items: { type: Type.STRING },
						},
					},
					required: ["title", "body", "tags"],
				},
			},
			contents: [
				{
					role: "user",
					parts: [
						{
							text: `以下のSlack会話をもとに、esaの記事を作成してください。\n\n# 会話内容\n${conversationText}`,
						},
					],
				},
			],
		});

		const jsonText = response.text?.trim();
		if (!jsonText) {
			throw new Error("Empty JSON response from Gemini");
		}

		return JSON.parse(jsonText);
	}
}
