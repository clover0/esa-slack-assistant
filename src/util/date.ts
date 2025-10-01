export function formatJP(date: Date): string {
	return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
