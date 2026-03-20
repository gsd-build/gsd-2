export type ImageProtocol = "kitty" | "iterm2" | null;

export interface TerminalCapabilities {
	images: ImageProtocol;
	trueColor: boolean;
	hyperlinks: boolean;
}

export interface CellDimensions {
	widthPx: number;
	heightPx: number;
}

export interface ImageDimensions {
	widthPx: number;
	heightPx: number;
}

export interface ImageRenderOptions {
	maxWidthCells?: number;
	maxHeightCells?: number;
	preserveAspectRatio?: boolean;
	/** Kitty image ID. If provided, reuses/replaces existing image with this ID. */
	imageId?: number;
}

let cachedCapabilities: TerminalCapabilities | null = null;

// Default cell dimensions - updated by TUI when terminal responds to query
let cellDimensions: CellDimensions = { widthPx: 9, heightPx: 18 };

export function getCellDimensions(): CellDimensions {
	return cellDimensions;
}

export function setCellDimensions(dims: CellDimensions): void {
	cellDimensions = dims;
}

export function detectCapabilities(): TerminalCapabilities {
	const termProgram = process.env.TERM_PROGRAM?.toLowerCase() || "";
	const term = process.env.TERM?.toLowerCase() || "";
	const colorTerm = process.env.COLORTERM?.toLowerCase() || "";
	const isCmux = Boolean(process.env.CMUX_WORKSPACE_ID && process.env.CMUX_SURFACE_ID);

	if (process.env.KITTY_WINDOW_ID || termProgram === "kitty") {
		return { images: "kitty", trueColor: true, hyperlinks: true };
	}

	if (isCmux) {
		return { images: "kitty", trueColor: true, hyperlinks: true };
	}

	if (termProgram === "ghostty" || term.includes("ghostty") || process.env.GHOSTTY_RESOURCES_DIR) {
		return { images: "kitty", trueColor: true, hyperlinks: true };
	}

	if (process.env.WEZTERM_PANE || termProgram === "wezterm") {
		return { images: "kitty", trueColor: true, hyperlinks: true };
	}

	if (process.env.ITERM_SESSION_ID || termProgram === "iterm.app") {
		return { images: "iterm2", trueColor: true, hyperlinks: true };
	}

	if (termProgram === "vscode") {
		return { images: null, trueColor: true, hyperlinks: true };
	}

	if (termProgram === "alacritty") {
		return { images: null, trueColor: true, hyperlinks: true };
	}

	const trueColor = colorTerm === "truecolor" || colorTerm === "24bit";
	return { images: null, trueColor, hyperlinks: true };
}

export function getCapabilities(): TerminalCapabilities {
	if (!cachedCapabilities) {
		cachedCapabilities = detectCapabilities();
	}
	return cachedCapabilities;
}

export function resetCapabilitiesCache(): void {
	cachedCapabilities = null;
}

const KITTY_PREFIX = "\x1b_G";
const ITERM2_PREFIX = "\x1b]1337;File=";

export function isImageLine(line: string): boolean {
	// Fast path: sequence at line start (single-row images)
	if (line.startsWith(KITTY_PREFIX) || line.startsWith(ITERM2_PREFIX)) {
		return true;
	}
	// Slow path: sequence elsewhere (multi-row images have cursor-up prefix)
	return line.includes(KITTY_PREFIX) || line.includes(ITERM2_PREFIX);
}

/**
 * Generate a random image ID for Kitty graphics protocol.
 * Uses random IDs to avoid collisions between different module instances
 * (e.g., main app vs extensions).
 */
export function allocateImageId(): number {
	// Use random ID in range [1, 0xffffffff] to avoid collisions
	return Math.floor(Math.random() * 0xfffffffe) + 1;
}

export function encodeKitty(
	base64Data: string,
	options: {
		columns?: number;
		rows?: number;
		imageId?: number;
	} = {},
): string {
	const CHUNK_SIZE = 4096;

	const params: string[] = ["a=T", "f=100", "q=2"];

	if (options.columns) params.push(`c=${options.columns}`);
	if (options.rows) params.push(`r=${options.rows}`);
	if (options.imageId) params.push(`i=${options.imageId}`);

	if (base64Data.length <= CHUNK_SIZE) {
		return `\x1b_G${params.join(",")};${base64Data}\x1b\\`;
	}

	const chunks: string[] = [];
	let offset = 0;
	let isFirst = true;

	while (offset < base64Data.length) {
		const chunk = base64Data.slice(offset, offset + CHUNK_SIZE);
		const isLast = offset + CHUNK_SIZE >= base64Data.length;

		if (isFirst) {
			chunks.push(`\x1b_G${params.join(",")},m=1;${chunk}\x1b\\`);
			isFirst = false;
		} else if (isLast) {
			chunks.push(`\x1b_Gm=0;${chunk}\x1b\\`);
		} else {
			chunks.push(`\x1b_Gm=1;${chunk}\x1b\\`);
		}

		offset += CHUNK_SIZE;
	}

	return chunks.join("");
}

/**
 * Delete a Kitty graphics image by ID.
 * Uses uppercase 'I' to also free the image data.
 */
export function deleteKittyImage(imageId: number): string {
	return `\x1b_Ga=d,d=I,i=${imageId}\x1b\\`;
}

/**
 * Delete all visible Kitty graphics images.
 * Uses uppercase 'A' to also free the image data.
 */
export function deleteAllKittyImages(): string {
	return `\x1b_Ga=d,d=A\x1b\\`;
}

export function encodeITerm2(
	base64Data: string,
	options: {
		width?: number | string;
		height?: number | string;
		name?: string;
		preserveAspectRatio?: boolean;
		inline?: boolean;
	} = {},
): string {
	const params: string[] = [`inline=${options.inline !== false ? 1 : 0}`];

	if (options.width !== undefined) params.push(`width=${options.width}`);
	if (options.height !== undefined) params.push(`height=${options.height}`);
	if (options.name) {
		const nameBase64 = Buffer.from(options.name).toString("base64");
		params.push(`name=${nameBase64}`);
	}
	if (options.preserveAspectRatio === false) {
		params.push("preserveAspectRatio=0");
	}

	return `\x1b]1337;File=${params.join(";")}:${base64Data}\x07`;
}

export function calculateImageRows(
	imageDimensions: ImageDimensions,
	targetWidthCells: number,
	cellDimensions: CellDimensions = { widthPx: 9, heightPx: 18 },
): number {
	const targetWidthPx = targetWidthCells * cellDimensions.widthPx;
	const scale = targetWidthPx / imageDimensions.widthPx;
	const scaledHeightPx = imageDimensions.heightPx * scale;
	const rows = Math.ceil(scaledHeightPx / cellDimensions.heightPx);
	return Math.max(1, rows);
}

/**
 * Parse image dimensions using the native Rust image module.
 * Auto-detects format from byte content (PNG, JPEG, GIF, WebP).
 */
export async function getImageDimensions(base64Data: string): Promise<ImageDimensions | null> {
	const { parseImage: parse } = await import("@gsd/native/image");
	try {
		const bytes = new Uint8Array(Buffer.from(base64Data, "base64"));
		const handle = await parse(bytes);
		return { widthPx: handle.width, heightPx: handle.height };
	} catch {
		return null;
	}
}

export function renderImage(
	base64Data: string,
	imageDimensions: ImageDimensions,
	options: ImageRenderOptions = {},
): { sequence: string; rows: number; imageId?: number } | null {
	const caps = getCapabilities();

	if (!caps.images) {
		return null;
	}

	const maxWidth = options.maxWidthCells ?? 80;
	const rows = calculateImageRows(imageDimensions, maxWidth, getCellDimensions());

	if (caps.images === "kitty") {
		// Only use imageId if explicitly provided - static images don't need IDs
		const sequence = encodeKitty(base64Data, { columns: maxWidth, rows, imageId: options.imageId });
		return { sequence, rows, imageId: options.imageId };
	}

	if (caps.images === "iterm2") {
		const sequence = encodeITerm2(base64Data, {
			width: maxWidth,
			height: "auto",
			preserveAspectRatio: options.preserveAspectRatio ?? true,
		});
		return { sequence, rows };
	}

	return null;
}

export function imageFallback(mimeType: string, dimensions?: ImageDimensions, filename?: string): string {
	const parts: string[] = [];
	if (filename) parts.push(filename);
	parts.push(`[${mimeType}]`);
	if (dimensions) parts.push(`${dimensions.widthPx}x${dimensions.heightPx}`);
	return `[Image: ${parts.join(" ")}]`;
}
