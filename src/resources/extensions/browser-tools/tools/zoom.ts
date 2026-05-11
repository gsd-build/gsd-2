import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * Region zoom / high-res capture — capture and upscale specific page regions.
 */

export function registerZoomTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_zoom_region",
		label: "Browser Zoom Region",
		description:
			"Capture and optionally upscale a specific rectangular region of the page for detailed inspection. " +
			"Useful for dense UIs where full-page screenshots have text too small to read. " +
			"Returns the region as an inline image, same as browser_screenshot.",
		compatibility: { producesImages: true },
		parameters: Type.Object({
			x: Type.Number({ description: "Left coordinate of the region in CSS pixels." }),
			y: Type.Number({ description: "Top coordinate of the region in CSS pixels." }),
			width: Type.Number({ description: "Width of the region in CSS pixels." }),
			height: Type.Number({ description: "Height of the region in CSS pixels." }),
			scale: Type.Optional(
				Type.Number({
					description: "Upscale factor (default: 2). Use 1 for native resolution, 2-4 for zoomed detail.",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { page: p } = await deps.ensureBrowser();
				const { x, y, width, height } = params;
				const scale = params.scale ?? 2;

				// Validate dimensions
				if (width <= 0 || height <= 0) {
					return {
						content: [{ type: "text", text: "Width and height must be positive." }],
						details: { error: "invalid_dimensions" },
						isError: true,
					};
				}

				// Capture the region using Playwright's clip option
				const regionBuffer = await p.screenshot({
					type: "png",
					clip: { x, y, width, height },
				});

				let outputBuffer: Buffer = regionBuffer;
				let outputMime = "image/png";

				// Upscale if scale > 1
				if (scale > 1) {
					const sharp = (await import("sharp")).default;
					const targetWidth = Math.round(width * scale);
					const targetHeight = Math.round(height * scale);

					outputBuffer = await sharp(regionBuffer)
						.resize(targetWidth, targetHeight, {
							kernel: "lanczos3",
							fit: "fill",
						})
						.png()
						.toBuffer();
				}

				const base64Data = outputBuffer.toString("base64");
				const title = await p.title();
				const url = p.url();

				return {
					content: [
						{
							type: "text",
							text: `Region capture: ${width}x${height} at (${x},${y})${scale > 1 ? ` upscaled ${scale}x to ${Math.round(width * scale)}x${Math.round(height * scale)}` : ""}\nPage: ${title}\nURL: ${url}`,
						},
						{
							type: "image",
							data: base64Data,
							mimeType: outputMime,
						},
					],
					details: {
						region: { x, y, width, height },
						scale,
						outputDimensions: {
							width: Math.round(width * scale),
							height: Math.round(height * scale),
						},
						title,
						url,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Region zoom failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}
