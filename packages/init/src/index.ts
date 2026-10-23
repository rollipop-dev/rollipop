import pc from 'picocolors';

import { detectProject, setupExpoConfig, setupPackage, setupReactNativeConfig } from './init';

const logger = {
  success(message: string) {
    console.log(pc.green('✓'), message);
  },
  info(message: string) {
    console.log(pc.cyan('ℹ'), message);
  },
  warn(message: string) {
    console.log(pc.yellow('⚠'), message);
  },
  error(message: string, reason: unknown) {
    console.error(
      pc.red('✗'),
      `${message}: ${reason instanceof Error ? reason.message : String(reason)}`,
    );
  },
};

console.log(
  `\n${pc.bold(pc.cyan('rollipop'))} ${pc.dim('— Modern build toolkit for React Native')}\n`,
);

const cwd = process.cwd();
let projectType: ReturnType<typeof detectProject>;
try {
  projectType = detectProject(cwd);
} catch (error) {
  logger.error('Project detection failed', error);
  process.exit(1);
}
logger.info(`${projectType} project detected`);

let failed = false;
let hasWarning = false;
const guideUrl =
  projectType === 'expo'
    ? 'https://rollipop.dev/docs/experimental/expo'
    : 'https://rollipop.dev/docs/get-started/quick-start';

try {
  const { status, filename } =
    projectType === 'expo'
      ? setupExpoConfig(cwd)
      : { status: setupReactNativeConfig(cwd), filename: 'react-native.config.js' };
  switch (status) {
    case 'created':
      logger.success(`Created ${pc.bold(filename)}`);
      break;
    case 'updated':
      logger.success(`Updated ${pc.bold(filename)}`);
      break;
    case 'already-configured':
      logger.info(`${pc.bold(filename)} already configured`);
      break;
    case 'manual-required':
      hasWarning = true;
      if (projectType === 'expo') {
        logger.warn(`Could not auto-configure dynamic Expo config: ${pc.bold(filename)}`);
        console.log(
          `  Add ${pc.green("'@rollipop/expo'")} to the exported config's ${pc.bold('plugins')} array, keeping existing entries.`,
        );
      } else {
        logger.warn(`Could not auto-configure: ${pc.bold('module.exports')} is not a plain object`);
        console.log(
          `  ${pc.dim('Add the following to your')} ${pc.bold(filename)}${pc.dim(':')}\n` +
            `  ${pc.green("commands: require('rollipop/commands')")}`,
        );
      }
      break;
  }
} catch (error) {
  logger.error(
    projectType === 'expo' ? 'Expo setup failed' : 'React Native CLI setup failed',
    error,
  );
  failed ||= true;
}

if (hasWarning || failed) console.log();

try {
  const dependencies = setupPackage(cwd);
  logger.success(
    `Added ${dependencies.map((dependency) => pc.bold(dependency)).join(', ')} to ${pc.bold('devDependencies')}`,
  );
} catch (error) {
  logger.error('Package setup failed', error);
  failed ||= true;
}

if (failed) {
  console.log(
    '\n' + pc.red('Setup failed.') + ` Follow the manual guide: ${pc.underline(pc.cyan(guideUrl))}`,
  );
  process.exit(1);
}

if (hasWarning) {
  logger.warn('Manual configuration is required to finish setup.');
} else {
  logger.success(pc.bold('Setup completed!'));
}
console.log();
console.log(`  ${pc.dim('Install dependencies manually to finish setup.')}`);
console.log(
  `  ${pc.dim('See')} ${pc.underline(pc.cyan(guideUrl))} ${pc.dim('for configuration details.')}`,
);
