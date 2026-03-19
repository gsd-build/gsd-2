/**
 * Marketplace Discovery Module
 * 
 * Reads marketplace.json from Claude marketplace repos, resolves plugin source paths,
 * parses plugin.json manifests, and inventories available components (skills, agents, commands, MCP servers, LSP servers, hooks).
 * 
 * Marketplace roots should reflect the Claude Code model documented by Anthropic:
 * users add a marketplace source with `/plugin marketplace add ...`, Claude stores
 * marketplace sources under `~/.claude/plugins/marketplaces/`, and installed plugin
 * payloads are copied into `~/.claude/plugins/cache/`.
 * 
 * Handles two marketplace catalog shapes observed in the wild:
 * 1. jamie-style: marketplace.json has {name, source} entries; plugins have .claude-plugin/plugin.json
 * 2. official-style: marketplace.json entries contain inline metadata
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from "./error-utils.js";

// ============================================================================
// Type Definitions
// ============================================================================

/** Owner information in marketplace manifest */
export interface MarketplaceOwner {
  name: string;
  email?: string;
  url?: string;
}

/** Marketplace metadata */
export interface MarketplaceMetadata {
  description?: string;
  version?: string;
}

/** Source can be a relative path or a complex object (github, url, git-subdir) */
export type PluginSource = string | {
  source?: string;
  repo?: string;
  url?: string;
  path?: string;
  sha?: string;
  ref?: string;
};

/** Marketplace plugin entry - minimal info from marketplace.json */
export interface MarketplacePluginEntry {
  name: string;
  source: PluginSource;
  // Optional inline metadata (official-style)
  description?: string;
  version?: string;
  author?: MarketplaceOwner;
  category?: string;
  homepage?: string;
  strict?: boolean;
  mcpServers?: Record<string, unknown>;
  lspServers?: Record<string, unknown>;
  tags?: string[];
}

/** Complete marketplace manifest */
export interface MarketplaceManifest {
  $schema?: string;
  name: string;
  description?: string;
  owner?: MarketplaceOwner;
  metadata?: MarketplaceMetadata;
  plugins: MarketplacePluginEntry[];
}

/** Plugin manifest from .claude-plugin/plugin.json */
export interface PluginManifest {
  name: string;
  description?: string;
  version?: string;
  author?: MarketplaceOwner;
  homepage?: string;
  mcpServers?: Record<string, unknown>;
  lspServers?: Record<string, unknown>;
  // Additional fields that might be present
  [key: string]: unknown;
}

/** Inventory of components in a plugin */
export interface PluginComponentInventory {
  skills: string[];
  agents: string[];
  commands: string[];
  mcpServers: Record<string, unknown>;
  lspServers: Record<string, unknown>;
  hooks?: string[];
}

/** Discovered plugin with all metadata and inventory */
export interface DiscoveredPlugin {
  name: string;
  canonicalName: string;
  source: PluginSource;
  resolvedPath: string | null;
  status: 'ok' | 'error';
  error?: string;
  // Metadata sources
  manifestSource: 'plugin.json' | 'marketplace-inline' | 'derived';
  description?: string;
  version?: string;
  author?: MarketplaceOwner;
  category?: string;
  homepage?: string;
  // Component inventory
  inventory: PluginComponentInventory;
}

/** Result of marketplace discovery */
export interface MarketplaceDiscoveryResult {
  status: 'ok' | 'error';
  error?: string;
  marketplacePath: string;
  marketplaceName: string;
  pluginFormat: 'jamie-style' | 'official-style' | 'unknown';
  plugins: DiscoveredPlugin[];
  summary: {
    total: number;
    ok: number;
    error: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a source path is a relative local path (not a URL or complex source)
 */
function isLocalSource(source: PluginSource): source is string {
  if (typeof source === 'string') {
    return !source.startsWith('http://') && 
           !source.startsWith('https://') && 
           !source.startsWith('git@') &&
           !source.includes('://');
  }
  return false;
}

/**
 * Resolve a relative source path to an absolute directory path
 */
export function resolvePluginRoot(repoRoot: string, source: PluginSource): string | null {
  if (!isLocalSource(source)) {
    // External source (URL, git repo) - can't resolve locally
    return null;
  }
  
  // Handle both ./plugins/name and plugins/name formats
  let resolvedPath = source;
  if (source.startsWith('./')) {
    resolvedPath = source.slice(2);
  }
  
  const absolutePath = path.resolve(repoRoot, resolvedPath);
  return absolutePath;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Parse marketplace.json from a marketplace repository root
 * 
 * @param repoRoot - Absolute path to the marketplace repository root
 * @returns Parsed marketplace manifest or error
 */
export function parseMarketplaceJson(repoRoot: string): 
  | { success: true; manifest: MarketplaceManifest }
  | { success: false; error: string } {
  
  const marketplacePath = path.join(repoRoot, '.claude-plugin', 'marketplace.json');
  
  // Check if file exists
  if (!fs.existsSync(marketplacePath)) {
    return {
      success: false,
      error: `marketplace.json not found at ${marketplacePath}`
    };
  }
  
  // Read and parse JSON
  let content: string;
  try {
    content = fs.readFileSync(marketplacePath, 'utf-8');
  } catch (err) {
    return {
      success: false,
      error: `Failed to read marketplace.json: ${getErrorMessage(err)}`
    };
  }
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse marketplace.json: ${getErrorMessage(err)}`
    };
  }
  
  // Validate structure
  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      error: 'marketplace.json is not a valid JSON object'
    };
  }
  
  const manifest = parsed as MarketplaceManifest;
  
  if (!manifest.name) {
    return {
      success: false,
      error: 'marketplace.json missing required field: name'
    };
  }
  
  if (!Array.isArray(manifest.plugins)) {
    return {
      success: false,
      error: 'marketplace.json missing or invalid field: plugins (must be array)'
    };
  }
  
  return { success: true, manifest };
}

/**
 * Inspect a plugin directory to extract metadata and inventory
 * 
 * @param pluginDir - Absolute path to the plugin directory
 * @param marketplaceEntry - Optional marketplace entry for inline metadata fallback
 * @returns Discovered plugin information
 */
export function inspectPlugin(
  pluginDir: string,
  marketplaceEntry?: MarketplacePluginEntry
): DiscoveredPlugin {
  const result: DiscoveredPlugin = {
    name: marketplaceEntry?.name || path.basename(pluginDir),
    canonicalName: marketplaceEntry?.name || path.basename(pluginDir),
    source: marketplaceEntry?.source || './',
    resolvedPath: pluginDir,
    status: 'ok',
    manifestSource: 'derived',
    inventory: {
      skills: [],
      agents: [],
      commands: [],
      mcpServers: {},
      lspServers: {},
      hooks: []
    }
  };
  
  // Check if directory exists
  if (!fs.existsSync(pluginDir)) {
    result.status = 'error';
    result.error = `Plugin directory not found: ${pluginDir}`;
    return result;
  }
  
  // Try to read plugin.json from .claude-plugin/
  const pluginJsonPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  
  if (fs.existsSync(pluginJsonPath)) {
    try {
      const content = fs.readFileSync(pluginJsonPath, 'utf-8');
      const manifest = JSON.parse(content) as PluginManifest;
      
      // Extract metadata from plugin.json
      result.manifestSource = 'plugin.json';
      result.description = manifest.description;
      result.version = manifest.version;
      result.author = manifest.author;
      result.homepage = manifest.homepage;
      
      if (manifest.mcpServers) {
        result.inventory.mcpServers = manifest.mcpServers;
      }
      if (manifest.lspServers) {
        result.inventory.lspServers = manifest.lspServers;
      }
    } catch (err) {
      // Fall back to marketplace inline or derived
      result.error = `Failed to parse plugin.json: ${getErrorMessage(err)}`;
    }
  }
  
  // If no plugin.json, use marketplace inline metadata
  if (result.manifestSource === 'derived' && marketplaceEntry) {
    result.manifestSource = 'marketplace-inline';
    result.description = marketplaceEntry.description;
    result.version = marketplaceEntry.version;
    result.author = marketplaceEntry.author;
    result.category = marketplaceEntry.category;
    result.homepage = marketplaceEntry.homepage;
    
    if (marketplaceEntry.mcpServers) {
      result.inventory.mcpServers = marketplaceEntry.mcpServers;
    }
    if (marketplaceEntry.lspServers) {
      result.inventory.lspServers = marketplaceEntry.lspServers;
    }
  }
  
  // Try to read plugin.json in root (alternative location)
  const altPluginJsonPath = path.join(pluginDir, 'plugin.json');
  if (fs.existsSync(altPluginJsonPath) && result.manifestSource === 'derived') {
    try {
      const content = fs.readFileSync(altPluginJsonPath, 'utf-8');
      const manifest = JSON.parse(content) as PluginManifest;
      
      result.manifestSource = 'plugin.json';
      if (!result.description && manifest.description) {
        result.description = manifest.description;
      }
      if (!result.version && manifest.version) {
        result.version = manifest.version;
      }
      if (!result.author && manifest.author) {
        result.author = manifest.author;
      }
    } catch {
      // Ignore parse errors for alternative location
    }
  }
  
  // Inventory component directories
  const skillsDir = path.join(pluginDir, 'skills');
  if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
    try {
      result.inventory.skills = fs.readdirSync(skillsDir)
        .filter(item => {
          const itemPath = path.join(skillsDir, item);
          return fs.statSync(itemPath).isDirectory() || item.endsWith('.md');
        });
    } catch {
      // Ignore read errors
    }
  }
  
  const agentsDir = path.join(pluginDir, 'agents');
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    try {
      result.inventory.agents = fs.readdirSync(agentsDir)
        .filter(item => {
          const itemPath = path.join(agentsDir, item);
          return fs.statSync(itemPath).isDirectory() || item.endsWith('.md');
        });
    } catch {
      // Ignore read errors
    }
  }
  
  const commandsDir = path.join(pluginDir, 'commands');
  if (fs.existsSync(commandsDir) && fs.statSync(commandsDir).isDirectory()) {
    try {
      result.inventory.commands = fs.readdirSync(commandsDir)
        .filter(item => {
          const itemPath = path.join(commandsDir, item);
          return fs.statSync(itemPath).isDirectory() || item.endsWith('.md');
        });
    } catch {
      // Ignore read errors
    }
  }
  
  // Also check for hooks at root level (jamie-style uses 'hooks/', not '.claude-plugin/hooks')
  const rootHooksDir = path.join(pluginDir, 'hooks');
  if (fs.existsSync(rootHooksDir) && fs.statSync(rootHooksDir).isDirectory()) {
    try {
      const rootHooks = fs.readdirSync(rootHooksDir)
        .filter(item => {
          const itemPath = path.join(rootHooksDir, item);
          return fs.statSync(itemPath).isDirectory() || item.endsWith('.md') || item.endsWith('.json');
        });
      const mergedHooks = [...(result.inventory.hooks || []), ...rootHooks];
      result.inventory.hooks = Array.from(new Set(mergedHooks));
    } catch {
      // Ignore read errors
    }
  }
  
  // Also check .claude-plugin/hooks (official-style)
  const hooksDir = path.join(pluginDir, '.claude-plugin', 'hooks');
  if (fs.existsSync(hooksDir) && fs.statSync(hooksDir).isDirectory()) {
    try {
      const pluginHooks = fs.readdirSync(hooksDir)
        .filter(item => {
          const itemPath = path.join(hooksDir, item);
          return fs.statSync(itemPath).isDirectory() || item.endsWith('.md');
        });
      const mergedHooks = [...(result.inventory.hooks || []), ...pluginHooks];
      result.inventory.hooks = Array.from(new Set(mergedHooks));
    } catch {
      // Ignore read errors
    }
  }
  
  return result;
}

/**
 * Discover all plugins in a marketplace repository
 * 
 * @param repoRoot - Absolute or relative path to the marketplace repository
 * @returns Marketplace discovery result with all plugins
 */
export function discoverMarketplace(repoRoot: string): MarketplaceDiscoveryResult {
  // Resolve to absolute path
  const absoluteRepoRoot = path.resolve(repoRoot);
  
  // Parse marketplace.json
  const parseResult = parseMarketplaceJson(absoluteRepoRoot);
  
  if (parseResult.success === false) {
    return {
      status: 'error',
      error: parseResult.error,
      marketplacePath: path.join(absoluteRepoRoot, '.claude-plugin', 'marketplace.json'),
      marketplaceName: path.basename(absoluteRepoRoot),
      pluginFormat: 'unknown',
      plugins: [],
      summary: { total: 0, ok: 0, error: 0 }
    };
  }
  
  const manifest = parseResult.manifest;
  
  // Determine plugin format based on structure
  const pluginFormat: 'jamie-style' | 'official-style' | 'unknown' = 
    manifest.plugins.every(p => p.source && !p.description && !p.version && !p.lspServers)
      ? 'jamie-style'
      : manifest.plugins.every(p => p.source && (p.description || p.version || p.lspServers))
        ? 'official-style'
        : 'unknown';
  
  // Discover each plugin
  const plugins: DiscoveredPlugin[] = manifest.plugins.map(entry => {
    const resolvedPath = resolvePluginRoot(absoluteRepoRoot, entry.source);
    
    if (!resolvedPath) {
      // External source - can't resolve locally
      return {
        name: entry.name,
        canonicalName: entry.name,
        source: entry.source,
        resolvedPath: null,
        status: 'ok',
        manifestSource: 'marketplace-inline',
        description: entry.description,
        version: entry.version,
        author: entry.author,
        category: entry.category,
        homepage: entry.homepage,
        inventory: {
          skills: [],
          agents: [],
          commands: [],
          mcpServers: entry.mcpServers || {},
          lspServers: entry.lspServers || {},
          hooks: []
        }
      };
    }
    
    return inspectPlugin(resolvedPath, entry);
  });
  
  // Calculate summary
  const summary = {
    total: plugins.length,
    ok: plugins.filter(p => p.status === 'ok').length,
    error: plugins.filter(p => p.status === 'error').length
  };
  
  return {
    status: summary.error > 0 ? 'error' : 'ok',
    marketplacePath: path.join(absoluteRepoRoot, '.claude-plugin', 'marketplace.json'),
    marketplaceName: manifest.name,
    pluginFormat,
    plugins,
    summary
  };
}

// ============================================================================
// Export all types and functions
// ============================================================================

export default {
  parseMarketplaceJson,
  inspectPlugin,
  discoverMarketplace,
  resolvePluginRoot
};
