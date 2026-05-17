import type { ChatHistory } from "../dto/chat-history";
import type { Chunk } from "../dto/chunk";
import type { Post } from "../dto/post";

export type SelectCategoryParams = {
	categories: string[];
	userQuestion: string;
	history?: ChatHistory[];
	now: Date;
};

export type GenerateKeywordsParams = {
	categories: string[];
	userQuestion: string;
	history?: ChatHistory[];
	now: Date;
};

export type AnswerQuestionParams = {
	question: string;
	history?: ChatHistory[];
	now: Date;
};

export type CheckDuplicateParams = {
	posts: Post[];
	conversationSummary: string;
	now: Date;
};

export type CheckDuplicateResult = {
	isDuplicate: boolean;
	matchedPosts?: Post[];
	additionalInfo?: string[];
	reason: string;
};

export type GenerateArticleParams = {
	conversation: ChatHistory[];
	category?: string;
	now: Date;
};

export type GeneratedArticle = {
	title: string;
	body: string;
	tags: string[];
};

export interface QuestionAnswerService {
	answerQuestion(params: AnswerQuestionParams): Promise<AsyncGenerator<Chunk>>;
}

export interface ArticleService {
	selectCategory(params: SelectCategoryParams): Promise<string[]>;

	generateKeywords(params: GenerateKeywordsParams): Promise<string[]>;

	checkDuplicate(params: CheckDuplicateParams): Promise<CheckDuplicateResult>;

	generateArticle(params: GenerateArticleParams): Promise<GeneratedArticle>;
}
