import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Editor, type EditorTheme } from "../editor.js";

const theme: EditorTheme = {
	borderColor: (text) => text,
	selectList: {} as EditorTheme["selectList"],
};

const tui = {
	requestRender() {},
} as any;

describe("Editor", () => {
	it("treats raw ESC+CR as newline instead of submit", () => {
		const editor = new Editor(tui, theme);
		const submissions: string[] = [];

		editor.onSubmit = (text) => submissions.push(text);
		editor.handleInput("h");
		editor.handleInput("i");
		editor.handleInput("\x1b\r");
		editor.handleInput("t");
		editor.handleInput("h");
		editor.handleInput("e");
		editor.handleInput("r");
		editor.handleInput("e");

		assert.equal(editor.getText(), "hi\nthere");
		assert.deepEqual(submissions, []);
	});
});
