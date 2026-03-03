import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const root = process.cwd();

const paths = {
  pkg: path.join(root, 'package.json'),
  lock: path.join(root, 'package-lock.json'),
  changelog: path.join(root, 'CHANGELOG.md'),
  addonConfig: path.join(root, 'hassio-addon', 'config.yaml'),
  addonChangelog: path.join(root, 'hassio-addon', 'CHANGELOG.md'),
  addonDockerfile: path.join(root, 'hassio-addon', 'Dockerfile'),
};

const releaseFiles = [
  'package.json',
  'package-lock.json',
  'CHANGELOG.md',
  'hassio-addon/config.yaml',
  'hassio-addon/CHANGELOG.md',
];

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PLACEHOLDER_RELEASE_NOTE = 'Release metadata sync.';

function usage() {
  console.log(
    `\nUsage:\n  npm run release:check\n  npm run release:prep -- --version 1.1.0 [--date 2026-02-14]\n  npm run release:cut [-- --publish]\n  npm run release:publish\n`
  );
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function extractAddonVersion(configYaml) {
  const quotedMatch = configYaml.match(/^version:\s*["']([^"']+)["']/m);
  if (quotedMatch) return quotedMatch[1];

  const plainMatch = configYaml.match(/^version:\s*([^\s#]+)\s*(?:#.*)?$/m);
  return plainMatch ? plainMatch[1] : null;
}

function upsertTopSection(changelog, heading, body) {
  if (changelog.includes(heading)) return changelog;

  const headerMatch = changelog.match(/^#\s+Changelog\s*\n+/i);
  if (!headerMatch) {
    return `# Changelog\n\n${heading}\n\n${body}\n\n${changelog}`;
  }

  const insertAt = headerMatch[0].length;
  return `${changelog.slice(0, insertAt)}${heading}\n\n${body}\n\n${changelog.slice(insertAt)}`;
}

function upsertMainChangelogEntry(changelog, appVersion, releaseDate) {
  const heading = `## [${appVersion}] — ${releaseDate}`;
  const body = ['### Changed', '- Release metadata sync.'].join('\n');

  if (changelog.includes(`## [${appVersion}]`)) return changelog;

  const semverAnchor = 'and this project adheres to [Semantic Versioning](https://semver.org/).';
  const idx = changelog.indexOf(semverAnchor);
  if (idx === -1) {
    return `${changelog.trimEnd()}\n\n${heading}\n\n${body}\n`;
  }

  const insertAt = idx + semverAnchor.length;
  return `${changelog.slice(0, insertAt)}\n\n${heading}\n\n${body}\n${changelog.slice(insertAt)}`;
}

function extractMainChangelogNotes(changelog, appVersion) {
  const headingRegex = new RegExp(
    `^## \\[${appVersion.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\].*$`,
    'm'
  );
  const headingMatch = changelog.match(headingRegex);
  if (!headingMatch || headingMatch.index === undefined) {
    return `Release ${appVersion}`;
  }

  const start = headingMatch.index + headingMatch[0].length;
  const rest = changelog.slice(start);
  const nextHeadingMatch = rest.match(/^##\s+/m);
  const end =
    nextHeadingMatch && nextHeadingMatch.index !== undefined
      ? start + nextHeadingMatch.index
      : changelog.length;

  const sectionBody = changelog.slice(start, end).trim();
  return sectionBody || `Release ${appVersion}`;
}

function extractAddonChangelogNotes(changelog, addonVersion) {
  const heading = `## ${addonVersion}`;
  const headingIndex = changelog.indexOf(heading);
  if (headingIndex === -1) {
    return `Release ${addonVersion}`;
  }

  const start = headingIndex + heading.length;
  const rest = changelog.slice(start);
  const nextHeadingMatch = rest.match(/^##\s+/m);
  const end =
    nextHeadingMatch && nextHeadingMatch.index !== undefined
      ? start + nextHeadingMatch.index
      : changelog.length;

  const sectionBody = changelog.slice(start, end).trim();
  return sectionBody || `Release ${addonVersion}`;
}

function hasMeaningfulReleaseNotes(notes) {
  const bullets = notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) =>
      line
        .replace(/^-\s+/, '')
        .trim()
        .replace(/[.。]+$/g, '')
    );

  if (!bullets.length) return false;

  return bullets.some((line) => {
    const normalized = line.toLowerCase();
    return normalized !== PLACEHOLDER_RELEASE_NOTE.toLowerCase().replace(/[.。]+$/g, '');
  });
}

function updateAddonConfigVersion(configYaml, version) {
  const replaced = configYaml.replace(
    /^version:\s*(?:"[^"]+"|'[^']+'|[^\s#]+)(\s*(?:#.*)?)?$/m,
    `version: "${version}"$1`
  );

  if (replaced === configYaml) {
    throw new Error('Could not update hassio-addon/config.yaml version line.');
  }

  return replaced;
}

function isPreRelease(version) {
  return /-(alpha|beta|rc)/i.test(version);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

async function runGit(args, options = {}) {
  return execFileAsync('git', args, { cwd: root, ...options });
}

async function runNpmScript(scriptName) {
  if (process.platform === 'win32') {
    const comSpec = process.env.ComSpec || 'cmd.exe';
    await execFileAsync(comSpec, ['/d', '/s', '/c', npmCmd, 'run', scriptName], {
      cwd: root,
      maxBuffer: 1024 * 1024 * 8,
    });
    return;
  }

  await execFileAsync(npmCmd, ['run', scriptName], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function getGitStatusFiles() {
  const { stdout } = await runGit(['status', '--porcelain']);
  const lines = stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return lines.map((line) => {
    const rawPath = line.slice(3);
    const resolvedPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath;
    return normalizePath(resolvedPath.trim());
  });
}

async function hasStagedChanges() {
  try {
    await runGit(['diff', '--cached', '--quiet']);
    return false;
  } catch {
    return true;
  }
}

async function runPublish() {
  const [pkg, changelog] = await Promise.all([
    readJson(paths.pkg),
    readFile(paths.changelog, 'utf8'),
  ]);

  const appVersion = pkg.version;
  if (!appVersion) fail('Missing package.json version.');

  const tag = `v${appVersion}`;

  try {
    await execFileAsync('git', ['rev-parse', '--verify', tag], { cwd: root });
  } catch {
    fail(`Tag ${tag} does not exist locally. Create/tag before running release:publish.`);
  }

  try {
    await execFileAsync('gh', ['release', 'view', tag], { cwd: root });
    console.log(`ℹ️ GitHub release ${tag} already exists. Skipping publish.`);
    return;
  } catch {
    // not found, continue with create
  }

  const notes = extractMainChangelogNotes(changelog, appVersion);
  const createArgs = ['release', 'create', tag, '--title', tag, '--notes', notes];
  if (isPreRelease(appVersion)) {
    createArgs.push('--prerelease');
  }

  await execFileAsync('gh', createArgs, { cwd: root, maxBuffer: 1024 * 1024 * 4 });
  console.log(
    `✅ Published GitHub release ${tag}${isPreRelease(appVersion) ? ' (pre-release)' : ''}.`
  );
}

async function runCheck() {
  const [pkg, lock, mainChangelog, addonConfig, addonChangelog, addonDockerfile] =
    await Promise.all([
      readJson(paths.pkg),
      readJson(paths.lock),
      readFile(paths.changelog, 'utf8'),
      readFile(paths.addonConfig, 'utf8'),
      readFile(paths.addonChangelog, 'utf8'),
      readFile(paths.addonDockerfile, 'utf8'),
    ]);

  const errors = [];
  const pkgVersion = pkg.version;
  const lockVersion = lock.version;
  const lockRootVersion = lock.packages?.['']?.version;
  const addonVersion = extractAddonVersion(addonConfig);

  if (!pkgVersion) errors.push('Missing package.json version.');
  if (lockVersion !== pkgVersion)
    errors.push(`package-lock.json version (${lockVersion}) != package.json (${pkgVersion}).`);
  if (lockRootVersion !== pkgVersion)
    errors.push(
      `package-lock.json root package version (${lockRootVersion}) != package.json (${pkgVersion}).`
    );
  if (!mainChangelog.includes(`## [${pkgVersion}]`))
    errors.push(`CHANGELOG.md is missing entry for ${pkgVersion}.`);
  else {
    const mainNotes = extractMainChangelogNotes(mainChangelog, pkgVersion);
    if (!hasMeaningfulReleaseNotes(mainNotes)) {
      errors.push('CHANGELOG.md release notes must include short, meaningful change bullets.');
    }
  }

  if (!addonVersion) {
    errors.push('Could not read hassio-addon/config.yaml version.');
  } else {
    if (pkgVersion !== addonVersion) {
      errors.push(
        `package.json version (${pkgVersion}) must equal hassio-addon/config.yaml version (${addonVersion}) for lockstep versioning.`
      );
    }
    if (!addonChangelog.includes(`## ${addonVersion}`)) {
      errors.push(`hassio-addon/CHANGELOG.md is missing entry for ${addonVersion}.`);
    } else {
      const addonNotes = extractAddonChangelogNotes(addonChangelog, addonVersion);
      if (!hasMeaningfulReleaseNotes(addonNotes)) {
        errors.push(
          'hassio-addon/CHANGELOG.md release notes must include short, meaningful change bullets.'
        );
      }
    }
  }

  if (!addonDockerfile.includes('BUILD_VERSION')) {
    errors.push(
      'hassio-addon/Dockerfile must use BUILD_VERSION to select source revision and avoid stale cached main builds.'
    );
  }

  if (errors.length) {
    console.error('❌ Release check failed:\n');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log('✅ Release check passed. Versions and changelogs are in sync.');
}

async function runPrep(args) {
  const version = args.version;
  const releaseDate = args.date || new Date().toISOString().slice(0, 10);

  if (!version) {
    usage();
    fail('release:prep requires --version.');
  }

  const [pkg, lock, mainChangelog, addonConfig, addonChangelog] = await Promise.all([
    readJson(paths.pkg),
    readJson(paths.lock),
    readFile(paths.changelog, 'utf8'),
    readFile(paths.addonConfig, 'utf8'),
    readFile(paths.addonChangelog, 'utf8'),
  ]);

  pkg.version = version;
  lock.version = version;
  if (!lock.packages) lock.packages = {};
  if (!lock.packages['']) lock.packages[''] = {};
  lock.packages[''].version = version;

  const nextAddonConfig = updateAddonConfigVersion(addonConfig, version);
  const nextMainChangelog = upsertMainChangelogEntry(mainChangelog, version, releaseDate);
  const nextAddonChangelog = upsertTopSection(
    addonChangelog,
    `## ${version}`,
    '- Add release notes.'
  );

  await Promise.all([
    writeJson(paths.pkg, pkg),
    writeJson(paths.lock, lock),
    writeFile(paths.addonConfig, nextAddonConfig, 'utf8'),
    writeFile(paths.changelog, nextMainChangelog, 'utf8'),
    writeFile(paths.addonChangelog, nextAddonChangelog, 'utf8'),
  ]);

  console.log(`✅ Prepared release files: version=${version}, date=${releaseDate}`);
}

async function runCut(args) {
  const pkg = await readJson(paths.pkg);
  const appVersion = pkg.version;
  if (!appVersion) fail('Missing package.json version.');

  console.log('🔎 Running release checks...');
  await runCheck();

  console.log('🧪 Running test suite...');
  await runNpmScript('test');

  console.log('🏗️ Building project...');
  await runNpmScript('build');

  const changedFiles = await getGitStatusFiles();
  if (!changedFiles.length) {
    fail('No working tree changes found. Run release:prep first.');
  }

  const allowed = new Set(releaseFiles.map(normalizePath));
  const unexpected = changedFiles.filter((file) => !allowed.has(file));
  if (unexpected.length) {
    fail(
      `Release cut only allows metadata files to be changed. Unexpected changes: ${unexpected.join(', ')}`
    );
  }

  await runGit(['add', ...releaseFiles]);

  if (!(await hasStagedChanges())) {
    fail('No staged metadata changes found after git add.');
  }

  const tag = `v${appVersion}`;

  try {
    await runGit(['rev-parse', '--verify', tag]);
    fail(`Tag ${tag} already exists locally.`);
  } catch {
    // expected when tag does not exist
  }

  await runGit(['commit', '-m', `release: ${tag}`], { maxBuffer: 1024 * 1024 * 4 });
  await runGit(['tag', '-a', tag, '-m', tag]);
  await runGit(['push', 'origin', 'HEAD'], { maxBuffer: 1024 * 1024 * 4 });
  await runGit(['push', 'origin', tag], { maxBuffer: 1024 * 1024 * 4 });

  console.log(`✅ Created and pushed ${tag}.`);

  if (args.publish) {
    console.log('🚀 Publishing GitHub release...');
    await runPublish();
  }
}

async function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'check') {
    await runCheck();
    return;
  }

  if (command === 'prep') {
    await runPrep(args);
    return;
  }

  if (command === 'publish') {
    await runPublish();
    return;
  }

  if (command === 'cut') {
    await runCut(args);
    return;
  }

  usage();
  fail(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
