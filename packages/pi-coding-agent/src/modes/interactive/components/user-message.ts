// Project/App: GSD-2
// File Purpose: Left-edge user message rail renderer for interactive chat transcripts.

import { Container, Markdown, type MarkdownTheme } from "@gsd/pi-tui";
import { getMarkdownTheme } from "../theme/theme.js";
import { formatTimestamp, type TimestampFormat } from "./timestamp.js";
import { chatMessageWidth, renderUserRail } from "./transcript-design.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";

/**
 * Component that renders a user message against the left edge of the chat transcript.
 */
export class UserMessageComponent extends Container {
	private timestamp: number | undefined;
	private timestampFormat: TimestampFormat;

	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme(), timestamp?: number, timestampFormat: TimestampFormat = "date-time-iso") {
		super();
		this.timestamp = timestamp;
		this.timestampFormat = timestampFormat;
		this.addChild(new Markdown(text, 0, 0, markdownTheme));
	}

	override render(width: number): string[] {
		const frameWidth = Math.max(20, width);
		const messageWidth = chatMessageWidth(frameWidth);
		const contentWidth = Math.max(1, messageWidth - 2);
		const lines = super.render(contentWidth);
		const meta =
			this.timestamp !== undefined
				? formatTimestamp(this.timestamp, this.timestampFormat)
				: undefined;
		const framed = renderUserRail(lines, frameWidth, {
			label: "You",
			meta,
		});
		if (framed.length === 0) {
			return framed;
		}
		const out = ["", ...framed];
		const firstFrameLine = 1;
		const lastFrameLine = out.length - 1;
		out[firstFrameLine] = OSC133_ZONE_START + out[firstFrameLine];
		out[lastFrameLine] = out[lastFrameLine] + OSC133_ZONE_END;
		return out;
	}
}
