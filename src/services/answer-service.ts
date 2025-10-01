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
	posts: Post[];
	question: string;
	history?: ChatHistory[];
	now: Date;
};

export interface AnswerService {
	selectCategory(params: SelectCategoryParams): Promise<string[]>;

	generateKeywords(params: GenerateKeywordsParams): Promise<string[]>;

	answerQuestion(params: AnswerQuestionParams): Promise<AsyncGenerator<Chunk>>;
}
