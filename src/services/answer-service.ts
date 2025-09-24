import type { ChatHistory } from "../dto/chat-history";
import type { Chunk } from "../dto/chunk";
import type { Post } from "../dto/post";

export interface AnswerService {
	selectCategory(categories: string[], userQuestion: string): Promise<string[]>;

	answerQuestion(
		posts: Post[],
		question: string,
		history?: ChatHistory[],
	): Promise<AsyncGenerator<Chunk>>;
}
