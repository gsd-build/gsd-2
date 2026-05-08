import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Source legacy state tests exercise markdown derivation through deriveState().
// Production/runtime keeps this fallback disabled unless explicitly requested.
process.env.GSD_ALLOW_MARKDOWN_DERIVE_FALLBACK ??= '1';

// Register hook to redirect imports to the dist directory
register(new URL('./dist-redirect.mjs', import.meta.url), pathToFileURL('./'));
