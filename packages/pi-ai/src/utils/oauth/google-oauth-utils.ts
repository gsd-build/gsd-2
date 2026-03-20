/**
 * Shared utilities for Google OAuth providers (Gemini CLI and Antigravity).
 *
 * NOTE: This module uses Node.js http.createServer for the OAuth callback.
 * It is only intended for CLI use, not browser environments.
 */

import type { Server } from "node:http";
import type { OAuthCredentials } from "./types.js";

// Lazy-loaded http.createServer for Node.js environments
let _createServer: typeof import("node:http").createServer | null = null;
let _httpImportPromise: Promise<void> | null = null;
if (typeof process !== "undefined" && (process.versions?.node || process.versions?.bun)) {
	_httpImportPromise = import("node:http").then((m) => {
		_createServer = m.createServer;
	});
}

export type CallbackServerInfo = {
	server: Server;
	cancelWait: () => void;
	waitForCode: () => Promise<{ code: string; state: string } | null>;
};

/**
 * Get the lazily imported Node.js createServer function.
 * Throws if not running in a Node.js environment.
 */
async function getNodeCreateServer(
	providerName: string,
): Promise<typeof import("node:http").createServer> {
	if (_createServer) return _createServer;
	if (_httpImportPromise) {
		await _httpImportPromise;
	}
	if (_createServer) return _createServer;
	throw new Error(`${providerName} OAuth is only available in Node.js environments`);
}

/**
 * Start a local HTTP server to receive the OAuth callback.
 *
 * @param port - The port to listen on (e.g. 8085, 51121)
 * @param callbackPath - The URL path for the callback (e.g. "/oauth2callback", "/oauth-callback")
 * @param providerName - Human-readable provider name for error messages
 */
export async function startCallbackServer(
	port: number,
	callbackPath: string,
	providerName: string,
): Promise<CallbackServerInfo> {
	const createServer = await getNodeCreateServer(providerName);

	return new Promise((resolve, reject) => {
		let result: { code: string; state: string } | null = null;
		let cancelled = false;

		const server = createServer((req, res) => {
			const url = new URL(req.url || "", `http://localhost:${port}`);

			if (url.pathname === callbackPath) {
				const code = url.searchParams.get("code");
				const state = url.searchParams.get("state");
				const error = url.searchParams.get("error");

				if (error) {
					res.writeHead(400, { "Content-Type": "text/html" });
					res.end(
						`<html><body><h1>Authentication Failed</h1><p>Error: ${error}</p><p>You can close this window.</p></body></html>`,
					);
					return;
				}

				if (code && state) {
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(
						`<html><body><h1>Authentication Successful</h1><p>You can close this window and return to the terminal.</p></body></html>`,
					);
					result = { code, state };
				} else {
					res.writeHead(400, { "Content-Type": "text/html" });
					res.end(
						`<html><body><h1>Authentication Failed</h1><p>Missing code or state parameter.</p></body></html>`,
					);
				}
			} else {
				res.writeHead(404);
				res.end();
			}
		});

		server.on("error", (err) => {
			reject(err);
		});

		server.listen(port, "127.0.0.1", () => {
			resolve({
				server,
				cancelWait: () => {
					cancelled = true;
				},
				waitForCode: async () => {
					const sleep = () => new Promise((r) => setTimeout(r, 100));
					while (!result && !cancelled) {
						await sleep();
					}
					return result;
				},
			});
		});
	});
}

/**
 * Parse a redirect URL to extract the authorization code and state parameters.
 */
export function parseRedirectUrl(input: string): { code?: string; state?: string } {
	const value = input.trim();
	if (!value) return {};

	try {
		const url = new URL(value);
		return {
			code: url.searchParams.get("code") ?? undefined,
			state: url.searchParams.get("state") ?? undefined,
		};
	} catch {
		// Not a URL, return empty
		return {};
	}
}

/**
 * Get the user's email address from a Google OAuth access token.
 */
export async function getGoogleUserEmail(accessToken: string): Promise<string | undefined> {
	try {
		const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
			signal: AbortSignal.timeout(30_000),
		});

		if (response.ok) {
			const data = (await response.json()) as { email?: string };
			return data.email;
		}
	} catch {
		// Ignore errors, email is optional
	}
	return undefined;
}

/**
 * Refresh a Google OAuth token using the standard Google token endpoint.
 *
 * @param refreshToken - The refresh token
 * @param clientId - The OAuth client ID
 * @param clientSecret - The OAuth client secret
 * @param providerName - Human-readable provider name for error messages
 * @param extraFields - Additional fields to include in the returned credentials
 */
export async function refreshGoogleOAuthToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string,
	providerName: string,
	extraFields?: Record<string, unknown>,
): Promise<OAuthCredentials> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
		signal: AbortSignal.timeout(30_000),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`${providerName} token refresh failed: ${error}`);
	}

	const data = (await response.json()) as {
		access_token: string;
		expires_in: number;
		refresh_token?: string;
	};

	return {
		refresh: data.refresh_token || refreshToken,
		access: data.access_token,
		expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
		...extraFields,
	};
}
