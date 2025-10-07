export const loadingMessageBlock = () => {
	return {
		type: "context",
		elements: [
			{
				type: "mrkdwn",
				text: "記事を探しています...:hourglass_flowing_sand:",
			},
		],
	};
};
