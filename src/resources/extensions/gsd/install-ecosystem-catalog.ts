import { DefaultPackageManager, SettingsManager, getAgentDir } from '@gsd/pi-coding-agent';
import type { PackageManager } from '@gsd/pi-coding-agent';
import { join } from 'node:path';

const CONFIG_DIR_NAME = '.gsd';
const PUBLIC_NAMESPACE = 'gsd-build';

export type EcosystemCatalogScope = 'project-local' | 'user-global';
export type InstallerScope = 'project' | 'user';
export type CatalogReference = `${typeof PUBLIC_NAMESPACE}/${string}`;

export interface EcosystemCatalogEntry {
  slug: string;
  reference: CatalogReference;
  source: string;
}

const PI_FINDER_PIN = 'da6f87b4d2f32c2a112a3cb8ea5c84220cddf955';

export const ECOSYSTEM_CATALOG_ENTRIES: readonly EcosystemCatalogEntry[] = [
  {
    slug: 'workspace-scout',
    reference: 'gsd-build/workspace-scout',
    source: `git:https://github.com/default-anton/pi-finder.git@${PI_FINDER_PIN}`,
  },
] as const;

export const PUBLIC_ECOSYSTEM_CATALOG_REFERENCES = ECOSYSTEM_CATALOG_ENTRIES.map((entry) => entry.reference);

export interface EcosystemCatalogInstallOptions {
  scope: EcosystemCatalogScope;
  cwd?: string;
  agentDir?: string;
  packageManager?: PackageManager;
  settingsManager?: SettingsManager;
}

export interface EcosystemCatalogInstallResult {
  requestedReference: CatalogReference;
  slug: string;
  resolvedSource: string;
  chosenScope: EcosystemCatalogScope;
  installerScope: InstallerScope;
  actualManagedPath: string;
  settingsEntryAdded: boolean;
  settingsPath: string;
  activation: {
    status: 'pending-reload';
    summary: string;
  };
}

export class EcosystemCatalogInstallError extends Error {
  phase: string;
  code: string;
  details?: Record<string, unknown>;

  constructor(phase: string, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EcosystemCatalogInstallError';
    this.phase = phase;
    this.code = code;
    this.details = details;
  }
}

function resolveCatalogEntry(reference: string): EcosystemCatalogEntry {
  if (!reference.startsWith(`${PUBLIC_NAMESPACE}/`)) {
    throw new EcosystemCatalogInstallError(
      'reference',
      'catalog/invalid-reference',
      `Unsupported ${PUBLIC_NAMESPACE} reference: ${reference}`,
      { reference },
    );
  }

  const entry = ECOSYSTEM_CATALOG_ENTRIES.find((candidate) => candidate.reference === reference);

  if (!entry) {
    throw new EcosystemCatalogInstallError(
      'reference',
      'catalog/unknown-slug',
      `Unknown ${PUBLIC_NAMESPACE} slug: ${reference}`,
      { reference },
    );
  }

  return entry;
}

export function getInstallReferenceCompletions(): Array<{ cmd: string; desc: string }> {
  return PUBLIC_ECOSYSTEM_CATALOG_REFERENCES.map((reference) => ({
    cmd: reference,
    desc: `Install ${reference} from the ${PUBLIC_NAMESPACE} catalog`,
  }));
}

export async function installEcosystemCatalog(
  reference: string,
  options: EcosystemCatalogInstallOptions,
): Promise<EcosystemCatalogInstallResult> {
  const entry = resolveCatalogEntry(reference);
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir();
  const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
  const packageManager = options.packageManager ?? new DefaultPackageManager({ cwd, agentDir, settingsManager });
  const installerScope: InstallerScope = options.scope === 'project-local' ? 'project' : 'user';
  const local = installerScope === 'project';

  try {
    await packageManager.install(entry.source, { local });
  } catch (error) {
    throw new EcosystemCatalogInstallError(
      'install',
      'catalog/install-failed',
      error instanceof Error ? error.message : String(error),
      { reference, source: entry.source, installerScope },
    );
  }

  const actualManagedPath = packageManager.getInstalledPath(entry.source, installerScope);
  if (!actualManagedPath) {
    throw new EcosystemCatalogInstallError(
      'install',
      'catalog/unresolved-managed-path',
      `Installed source could not be resolved for ${entry.source}`,
      { reference, source: entry.source, installerScope },
    );
  }

  let settingsEntryAdded = false;
  try {
    settingsEntryAdded = packageManager.addSourceToSettings(entry.source, { local });
    await settingsManager.flush();
  } catch (error) {
    throw new EcosystemCatalogInstallError(
      'settings',
      'catalog/settings-write-failed',
      error instanceof Error ? error.message : String(error),
      { reference, source: entry.source, installerScope },
    );
  }

  const settingsPath = installerScope === 'project'
    ? join(cwd, CONFIG_DIR_NAME, 'settings.json')
    : join(agentDir, 'settings.json');

  return {
    requestedReference: entry.reference,
    slug: entry.slug,
    resolvedSource: entry.source,
    chosenScope: options.scope,
    installerScope,
    actualManagedPath,
    settingsEntryAdded,
    settingsPath,
    activation: {
      status: 'pending-reload',
      summary: 'Install completed. Reload is still required before the runtime can confirm activation.',
    },
  };
}
