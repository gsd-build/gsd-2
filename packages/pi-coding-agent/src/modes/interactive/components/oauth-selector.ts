import { getOAuthProviders } from "@gsd/pi-ai/oauth";
import { SNAPSHOT } from "@gsd/pi-ai";
import { Container, getEditorKeybindings, Spacer, TruncatedText } from "@gsd/pi-tui";
import type { AuthStorage } from "../../../core/auth-storage.js";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

interface ProviderItem {
	id: string;
	name: string;
	isOAuth: boolean;
}

/**
 * Component that renders an OAuth provider selector
 */
export class OAuthSelectorComponent extends Container {
	private listContainer: Container;
	private allProviders: ProviderItem[] = [];
	private selectedIndex: number = 0;
	private mode: "login" | "logout";
	private authStorage: AuthStorage;
	private onSelectCallback: (providerId: string) => void;
	private onCancelCallback: () => void;

	constructor(
		mode: "login" | "logout",
		authStorage: AuthStorage,
		onSelect: (providerId: string) => void,
		onCancel: () => void,
	) {
		super();

		this.mode = mode;
		this.authStorage = authStorage;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		// Load all OAuth providers
		this.loadProviders();

		// Add top border
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		// Add title
		const title = mode === "login" ? "Select provider to login:" : "Select provider to logout:";
		this.addChild(new TruncatedText(theme.bold(title)));
		this.addChild(new Spacer(1));

		// Create list container
		this.listContainer = new Container();
		this.addChild(this.listContainer);

		this.addChild(new Spacer(1));

		// Add bottom border
		this.addChild(new DynamicBorder());

		// Initial render
		this.updateList();
	}

	private loadProviders(): void {
		const oauthProviders = getOAuthProviders().map((p) => ({
			id: p.id,
			name: p.name,
			isOAuth: true,
		}));

		const apiKeyProviders: ProviderItem[] = [];
		for (const [id, provider] of Object.entries(SNAPSHOT)) {
			if (!oauthProviders.some((p) => p.id === id)) {
				apiKeyProviders.push({
					id,
					name: provider.name || id,
					isOAuth: false,
				});
			}
		}

		apiKeyProviders.sort((a, b) => a.name.localeCompare(b.name));

		this.allProviders = [...oauthProviders, ...apiKeyProviders];
	}

	private updateList(): void {
		this.listContainer.clear();

		for (let i = 0; i < this.allProviders.length; i++) {
			const provider = this.allProviders[i];
			if (!provider) continue;

			const isSelected = i === this.selectedIndex;

			// Check if user is logged in for this provider
			const credentials = this.authStorage.get(provider.id);
			const isLoggedIn = provider.isOAuth ? credentials?.type === "oauth" : credentials?.type === "api_key";
			const statusIndicator = isLoggedIn ? theme.fg("success", " ✓ logged in") : "";

			let line = "";
			if (isSelected) {
				const prefix = theme.fg("accent", "→ ");
				const text = theme.fg("accent", provider.name);
				line = prefix + text + statusIndicator;
			} else {
				const text = `  ${provider.name}`;
				line = text + statusIndicator;
			}

			this.listContainer.addChild(new TruncatedText(line, 0, 0));
		}

		// Show "no providers" if empty
		if (this.allProviders.length === 0) {
			const message =
				this.mode === "login" ? "No providers available" : "No providers logged in. Use /login first.";
			this.listContainer.addChild(new TruncatedText(theme.fg("muted", `  ${message}`), 0, 0));
		}
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		// Up arrow
		if (kb.matches(keyData, "selectUp")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		}
		// Down arrow
		else if (kb.matches(keyData, "selectDown")) {
			this.selectedIndex = Math.min(this.allProviders.length - 1, this.selectedIndex + 1);
			this.updateList();
		}
		// Enter
		else if (kb.matches(keyData, "selectConfirm")) {
			const selectedProvider = this.allProviders[this.selectedIndex];
			if (selectedProvider) {
				this.onSelectCallback(selectedProvider.id);
			}
		}
		// Escape or Ctrl+C
		else if (kb.matches(keyData, "selectCancel")) {
			this.onCancelCallback();
		}
	}
}
