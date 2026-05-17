import { FunctionTool, Gemini, LlmAgent } from "@google/adk";
import type { Logger } from "@slack/bolt";
import { z } from "zod";
import type { Post } from "../../dto/post";
import { type EsaClient, esaPostSortOptions } from "../../externals/esa/client";

type UnknownRecord = Record<string, unknown>;
type ToolLogger = Pick<Logger, "info" | "warn" | "debug">;

type EsaSearchClient = Pick<EsaClient, "getPosts" | "getPost">;
type CategoryPromptEntry = {
	path: string;
	posts?: number;
};

const trimmedStringParameter = z.string().trim().min(1);

const numberComparisonParameters = z.object({
	operator: z
		.enum([">", ">=", "<", "<=", "="])
		.describe("比較演算子。'=' は esa 検索クエリ上では演算子なしで指定する。"),
	value: z.number().int().min(0).describe("比較する数値。"),
});

const dateComparisonParameters = z.object({
	operator: z
		.enum([">", ">=", "<", "<=", "="])
		.describe("比較演算子。'=' は esa 検索クエリ上では演算子なしで指定する。"),
	value: trimmedStringParameter
		.regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/)
		.describe("比較する日付。YYYY、YYYY-MM、YYYY-MM-DD のいずれか。"),
});

const searchConditionKeys = [
	"exactKeywords",
	"title",
	"number",
	"wip",
	"kind",
	"category",
	"categoryPrefix",
	"exactCategory",
	"body",
	"tags",
	"user",
	"updatedBy",
	"comment",
	"stars",
	"watches",
	"comments",
	"created",
	"updated",
	"orKeywords",
	"excludeKeywords",
] as const;

const searchPostsParameters = z
	.object({
		exactKeywords: z
			.array(trimmedStringParameter)
			.min(1)
			.optional()
			.describe(
				"記事名、カテゴリ、本文に完全一致で含めたい語句。複数指定時は AND 検索。",
			),
		title: trimmedStringParameter
			.optional()
			.describe("記事名に含めたいキーワード。esa の title: に対応。"),
		number: z
			.number()
			.int()
			.min(1)
			.optional()
			.describe("記事ID。esa 記事 URL 末尾の番号。"),
		wip: z
			.boolean()
			.optional()
			.describe(
				"記事の WIP 状態。true は WIP、false は Shipped を検索する。未指定時は既定の WIP フィルタを使う。",
			),
		kind: z
			.enum(["stock", "flow"])
			.optional()
			.describe("記事の Stock or Flow 状態。"),
		category: trimmedStringParameter
			.optional()
			.describe("カテゴリ名に含めたいキーワード。部分一致。"),
		categoryPrefix: trimmedStringParameter
			.optional()
			.describe("カテゴリ名の前方一致。esa の in: に対応。"),
		exactCategory: trimmedStringParameter
			.optional()
			.describe("カテゴリ名の完全一致。esa の on: に対応。"),
		body: trimmedStringParameter
			.optional()
			.describe("記事本文に含めたいキーワード。"),
		tags: z
			.array(trimmedStringParameter)
			.min(1)
			.optional()
			.describe("記事に付いているタグ名。大文字小文字は標準では区別しない。"),
		caseSensitiveTag: z
			.boolean()
			.optional()
			.describe("tags の大文字小文字を区別して検索する場合のみ true。"),
		user: trimmedStringParameter
			.optional()
			.describe("記事作成者の screen_name。"),
		updatedBy: trimmedStringParameter
			.optional()
			.describe("記事の最終更新者の screen_name。"),
		comment: trimmedStringParameter
			.optional()
			.describe("コメント本文に含めたいキーワード。"),
		stars: numberComparisonParameters
			.optional()
			.describe("Star 数の比較条件。"),
		watches: numberComparisonParameters
			.optional()
			.describe("Watch 数の比較条件。"),
		comments: numberComparisonParameters
			.optional()
			.describe("コメント数の比較条件。"),
		created: dateComparisonParameters
			.optional()
			.describe("記事作成日の比較条件。"),
		updated: dateComparisonParameters
			.optional()
			.describe("記事更新日の比較条件。"),
		orKeywords: z
			.array(trimmedStringParameter)
			.min(2)
			.optional()
			.describe("いずれかの語句に完全一致する記事を探す OR 検索キーワード。"),
		excludeKeywords: z
			.array(trimmedStringParameter)
			.min(1)
			.optional()
			.describe("検索結果から除外したいキーワード。"),
		perPage: z
			.number()
			.int()
			.min(1)
			.max(10)
			.optional()
			.describe("返却する検索結果の最大件数。未指定時は 5 件、最大 10 件。"),
		page: z
			.number()
			.int()
			.min(1)
			.optional()
			.describe("取得する esa 検索結果のページ番号。未指定時は 1 ページ目。"),
		sort: z
			.enum(esaPostSortOptions)
			.optional()
			.describe(
				"検索結果の並び順。best_match-desc: ベストマッチ、updated-desc: 更新日時が新しい順、updated-asc: 更新日時が古い順、created-desc: 作成日時が新しい順、created-asc: 作成日時が古い順、stars-desc: Starの多い順、watches-desc: Watchの多い順、comments-desc: コメントの多い順、full_name-asc: カテゴリ・タイトル順、name-asc: 記事タイトル順、number-desc: 記事IDの大きい順、number-asc: 記事IDの小さい順。",
			),
	})
	.superRefine((input, context) => {
		const hasSearchCondition = searchConditionKeys.some((key) => {
			const value = input[key];
			return Array.isArray(value) ? value.length > 0 : value !== undefined;
		});
		if (!hasSearchCondition) {
			context.addIssue({
				code: "custom",
				message:
					"少なくとも1つの検索条件フィールドを指定してください。page と perPage だけでは検索できません。",
			});
		}
		if (input.caseSensitiveTag === true && input.tags === undefined) {
			context.addIssue({
				code: "custom",
				path: ["tags"],
				message: "caseSensitiveTag を指定する場合は tags も指定してください。",
			});
		}
	});

type SearchPostsInput = z.infer<typeof searchPostsParameters>;

const getPostParameters = z.object({
	postNumber: z
		.number()
		.int()
		.min(1)
		.describe("search_esa_posts の検索結果に含まれる esa 記事番号。"),
	includeComments: z
		.boolean()
		.optional()
		.describe(
			"コメントも取得するか。コメントが回答に関係する場合のみ true にする。",
		),
});

type GetPostInput = z.infer<typeof getPostParameters>;

export type EsaSearchAgentConfig = {
	esaClient: EsaSearchClient;
	project: string;
	location: string;
	model?: string;
	maxSearchResultBodyChars?: number;
	categoryPromptEntries?: CategoryPromptEntry[];
	logger?: ToolLogger;
};

const baseAgentInstruction = `あなたはナレッジシェアリングサービス「esa」の記事を検索してユーザーを支援するAIアシスタントです。
ユーザーの入力とSlackの会話文脈を読み取り、esa検索ツールを使って必要な記事を探し、根拠を明示して回答してください。

# 手順
1. 質問の意図を把握する
2. search_esa_posts で関連しそうな記事を検索する
3. search_esa_posts は一度だけ使うものではなく、検索キーワード、カテゴリ表現、ページ番号を変えながら何度も使う前提で調査する
4. 検索結果の本文スニペットだけで確定せず、回答根拠に使う候補は get_esa_post で本文を取得する
5. 情報が不足する場合は、別のキーワードやカテゴリ表現で search_esa_posts を再実行する
6. 検索結果に nextPage がある場合は、必要に応じて page を指定して追加の検索結果も確認する
7. get_esa_post で取得した記事の内容だけを根拠に回答する


# ルール
* esaのツール結果に含まれる情報だけを使用すること
* 一般知識、推測、想像、慣習的な補足は禁止
* 根拠が見つからない場合は、見つからなかったことを簡潔に伝える
* 回答に使用した記事のURLを必ず示すこと
* 根拠として参照した見出し、段落、箇所を示すこと
* 複数の記事を使う場合は、記事ごとに根拠を分けること
* 複数の search_esa_posts や get_esa_post を実行する場合、前の結果に依存しない tool 呼び出しは可能な限り並列に実行すること
* 作業中の不完全な記事の検索を避けるため、ユーザーから明示的な指示がない限り、search_esa_posts の wip フィールドは指定しないこと。未指定時は tool 側で wip:false を付与する
* 出力はSlackに投稿できるMarkdown形式にすること
* 長文を避け、必要な情報を簡潔にまとめること`;

export function createEsaSearchAgent(config: EsaSearchAgentConfig) {
	const tools = new EsaSearchTools(config);
	const instruction = buildAgentInstruction({
		categoryPromptEntries: config.categoryPromptEntries,
	});
	const model = new Gemini({
		vertexai: true,
		project: config.project,
		location: config.location,
		model: config.model ?? "gemini-3-flash-preview",
	});

	return new LlmAgent({
		name: "esa_search_agent",
		model,
		description: "esa 記事を検索し、根拠を引用して回答する。",
		instruction,
		tools: tools.build(),
		generateContentConfig: {
			temperature: 0,
			maxOutputTokens: 40000,
		},
	});
}

function buildAgentInstruction({
	categoryPromptEntries,
}: {
	categoryPromptEntries?: CategoryPromptEntry[];
}) {
	const categoryContext = buildCategoryContext({
		categoryPromptEntries,
	});
	return [baseAgentInstruction, categoryContext].filter(Boolean).join("\n\n");
}

function buildCategoryContext({
	categoryPromptEntries,
}: {
	categoryPromptEntries?: CategoryPromptEntry[];
}) {
	const categories = compressCategoryPromptEntries(categoryPromptEntries ?? []);
	if (categories.length === 0) {
		return "";
	}

	return `# esa カテゴリ概要
以下は esa に存在するカテゴリ一覧です。ユーザー入力の文脈把握と category/categoryPrefix/exactCategory 検索条件の選択に使ってください。回答の根拠には使わず、根拠は必ず get_esa_post で取得した記事本文に置いてください。
${categories.map(formatCategoryPromptEntry).join("\n")}`;
}

function compressCategoryPromptEntries(
	categoryPromptEntries: CategoryPromptEntry[],
) {
	return categoryPromptEntries
		.filter(
			(category) => category.path.trim() && !category.path.includes("Archive"),
		)
		.sort((a, b) => {
			const postsDiff = (b.posts ?? 0) - (a.posts ?? 0);
			if (postsDiff !== 0) {
				return postsDiff;
			}
			return a.path.localeCompare(b.path);
		});
}

function formatCategoryPromptEntry(category: CategoryPromptEntry) {
	const postsText =
		category.posts === undefined ? "" : ` (${category.posts} posts)`;
	return `- ${category.path}${postsText}`;
}

class EsaSearchTools {
	private readonly esaClient: EsaSearchClient;
	private readonly maxSearchResultBodyChars: number;
	private readonly logger?: ToolLogger;

	constructor(config: EsaSearchAgentConfig) {
		this.esaClient = config.esaClient;
		this.maxSearchResultBodyChars = config.maxSearchResultBodyChars ?? 1200;
		this.logger = config.logger;
	}

	build() {
		return [this.buildSearchPostsTool(), this.buildGetPostTool()];
	}

	private buildSearchPostsTool() {
		return new FunctionTool({
			name: "search_esa_posts",
			description:
				"esa の検索条件フィールドで記事を検索し、関連候補の記事と本文スニペットを返す。get_esa_post より先に使用する。",
			parameters: searchPostsParameters,
			execute: (input) => this.searchPosts(input),
		});
	}

	private buildGetPostTool() {
		return new FunctionTool({
			name: "get_esa_post",
			description:
				"esa 記事番号を指定して、Markdown 本文を含む単一の記事を取得する。最終回答で引用する記事ごとに使用する。",
			parameters: getPostParameters,
			execute: (input) => this.getPost(input),
		});
	}

	private async searchPosts(input: SearchPostsInput): Promise<UnknownRecord> {
		const { perPage, page, sort } = input;
		const resolvedPerPage = Math.min(perPage ?? 5, 10);
		const searchCriteria = toSearchCriteria(input);
		const esaQuery = buildEsaSearchQuery(input);
		const startedAt = Date.now();

		this.logger?.info({
			msg: "agent tool call",
			toolName: "search_esa_posts",
			searchCriteria,
			esaQuery,
			perPage: resolvedPerPage,
			requestedPerPage: perPage,
			page: page ?? 1,
			sort,
		});

		try {
			const response = await this.esaClient.getPosts({
				q: esaQuery,
				per_page: resolvedPerPage,
				...(page === undefined ? {} : { page }),
				...(sort === undefined ? {} : { sort }),
			});

			this.logger?.info({
				msg: "agent tool success",
				toolName: "search_esa_posts",
				durationMs: Date.now() - startedAt,
				query: esaQuery,
				page: response.page,
				perPage: response.per_page,
				returnedCount: response.posts.length,
				totalCount: response.total_count,
				nextPage: response.next_page,
			});

			return {
				status: "success",
				query: esaQuery,
				page: response.page,
				perPage: response.per_page,
				prevPage: response.prev_page,
				nextPage: response.next_page,
				totalCount: response.total_count,
				returnedCount: response.posts.length,
				sort,
				posts: response.posts.map((post) => this.toSearchResult(post)),
			};
		} catch (error) {
			this.logger?.warn({
				msg: "agent tool error",
				toolName: "search_esa_posts",
				durationMs: Date.now() - startedAt,
				query: esaQuery,
				error: errorToMessage(error),
			});

			return {
				status: "error",
				query: esaQuery,
				message: errorToMessage(error),
			};
		}
	}

	private async getPost({
		postNumber,
		includeComments = false,
	}: GetPostInput): Promise<UnknownRecord> {
		const startedAt = Date.now();

		this.logger?.info({
			msg: "agent tool call",
			toolName: "get_esa_post",
			postNumber,
			includeComments,
		});

		try {
			const post = await this.esaClient.getPost({
				postNumber,
				include: includeComments ? "comments" : undefined,
			});
			const retrievedPost = this.toRetrievedPost(post);

			this.logger?.info({
				msg: "agent tool success",
				toolName: "get_esa_post",
				durationMs: Date.now() - startedAt,
				postNumber: post.number,
				includeComments,
				title: post.name,
				url: post.url,
			});

			return {
				status: "success",
				post: retrievedPost,
			};
		} catch (error) {
			this.logger?.warn({
				msg: "agent tool error",
				toolName: "get_esa_post",
				durationMs: Date.now() - startedAt,
				postNumber,
				includeComments,
				error: errorToMessage(error),
			});

			return {
				status: "error",
				postNumber,
				message: errorToMessage(error),
			};
		}
	}

	private toSearchResult(post: Post) {
		const { text, truncated } = truncateText(
			post.body_md,
			this.maxSearchResultBodyChars,
		);
		return {
			number: post.number,
			name: post.name,
			fullName: post.full_name,
			category: post.category,
			tags: post.tags,
			url: post.url,
			createdAt: post.created_at,
			updatedAt: post.updated_at,
			bodySnippet: text,
			bodySnippetTruncated: truncated,
		};
	}

	private toRetrievedPost(post: Post) {
		return {
			number: post.number,
			name: post.name,
			fullName: post.full_name,
			category: post.category,
			tags: post.tags,
			url: post.url,
			createdAt: post.created_at,
			updatedAt: post.updated_at,
			bodyMd: post.body_md,
		};
	}
}

function buildEsaSearchQuery(input: SearchPostsInput) {
	const filters: string[] = [];

	filters.push(...(input.exactKeywords?.map(formatExactSearchValue) ?? []));
	if (input.title !== undefined) {
		filters.push(`title:${formatSearchValue(input.title)}`);
	}
	if (input.number !== undefined) {
		filters.push(`number:${input.number}`);
	}
	if (input.wip !== undefined) {
		filters.push(`wip:${input.wip}`);
	}
	if (input.kind !== undefined) {
		filters.push(`kind:${input.kind}`);
	}
	if (input.category !== undefined) {
		filters.push(`category:${formatSearchValue(input.category)}`);
	}
	if (input.categoryPrefix !== undefined) {
		filters.push(`in:${formatSearchValue(input.categoryPrefix)}`);
	}
	if (input.exactCategory !== undefined) {
		filters.push(`on:${formatSearchValue(input.exactCategory)}`);
	}
	if (input.body !== undefined) {
		filters.push(`body:${formatSearchValue(input.body)}`);
	}
	filters.push(
		...(input.tags?.map((tag) => `tag:${formatSearchValue(tag)}`) ?? []),
	);
	if (input.caseSensitiveTag === true) {
		filters.push("case_sensitive:true");
	}
	if (input.user !== undefined) {
		filters.push(`user:${formatSearchValue(input.user)}`);
	}
	if (input.updatedBy !== undefined) {
		filters.push(`updated_by:${formatSearchValue(input.updatedBy)}`);
	}
	if (input.comment !== undefined) {
		filters.push(`comment:${formatSearchValue(input.comment)}`);
	}
	if (input.stars !== undefined) {
		filters.push(formatComparison("stars", input.stars));
	}
	if (input.watches !== undefined) {
		filters.push(formatComparison("watches", input.watches));
	}
	if (input.comments !== undefined) {
		filters.push(formatComparison("comments", input.comments));
	}
	if (input.created !== undefined) {
		filters.push(formatComparison("created", input.created));
	}
	if (input.updated !== undefined) {
		filters.push(formatComparison("updated", input.updated));
	}
	if (input.orKeywords !== undefined) {
		filters.push(
			`(${input.orKeywords.map(formatExactSearchValue).join(" OR ")})`,
		);
	}
	filters.push(
		...(input.excludeKeywords?.map(
			(keyword) => `-${formatSearchValue(keyword)}`,
		) ?? []),
	);

	if (input.wip === undefined) {
		filters.push("wip:false");
	}
	filters.push("-Archive");
	return filters.join(" ");
}

function toSearchCriteria(input: SearchPostsInput) {
	const {
		page: _page,
		perPage: _perPage,
		sort: _sort,
		...searchCriteria
	} = input;
	return searchCriteria;
}

function formatSearchValue(value: string) {
	const trimmedValue = value.trim();
	if (/[\s"()]/.test(trimmedValue)) {
		return formatExactSearchValue(trimmedValue);
	}
	return trimmedValue;
}

function formatExactSearchValue(value: string) {
	return `"${value.trim().replace(/["\\]/g, "\\$&")}"`;
}

type ComparisonInput = {
	operator: ">" | ">=" | "<" | "<=" | "=";
	value: number | string;
};

function formatComparison(field: string, comparison: ComparisonInput) {
	const operator = comparison.operator === "=" ? "" : comparison.operator;
	return `${field}:${operator}${comparison.value}`;
}

function truncateText(text: string, maxChars: number) {
	if (text.length <= maxChars) {
		return { text, truncated: false };
	}
	return {
		text: text.slice(0, maxChars),
		truncated: true,
	};
}

function errorToMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
