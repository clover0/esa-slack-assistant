import type { KnownBlock } from "@slack/types";

export const buildAppHomeTabView = () => {
	const intro: KnownBlock[] = [
		{
			type: "header",
			text: { type: "plain_text", text: "Welcome 👋", emoji: true },
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: "このアプリは *Esa* の記事から回答を生成します。",
			},
		},
	];

	const howTo: KnownBlock[] = [
		{ type: "divider" },
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text:
					"*使い方*\n" +
					"1. チャンネルでボットにメンション(`@このアプリ`)して質問します。\n" +
					"2. 新規メンション → 新しいスレッドで回答します。\n" +
					"3. スレッド内でメンション → スレッド内のこれまでのやりとりも踏まえて回答します。",
			},
		},
	];

	return [...intro, ...howTo];
};
