const assert = require('node:assert/strict');
const { resolveExpoCompatibility } = require('../dist/compatibility/index.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');
const { createExpoServicesPlugin } = require('../dist/services.cjs');
const { createRouterPlugin, getRouterRoot, configureNativeRouter } = require('../dist/router.cjs');

const exampleRequire = createRequire(
  path.resolve(__dirname, '../../../examples/expo-58/package.json'),
);

function project(t, routerRoot = 'app') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-expo-routes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'node_modules'));
  for (const name of ['expo', 'expo-router']) {
    fs.symlinkSync(
      path.dirname(exampleRequire.resolve(`${name}/package.json`)),
      path.join(root, 'node_modules', name),
    );
  }
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { expo: '*', 'expo-router': '*' } }),
  );
  fs.writeFileSync(
    path.join(root, 'app.json'),
    JSON.stringify({
      expo: {
        name: 'Routes',
        slug: 'routes',
        experiments: { typedRoutes: true },
        extra: { router: { root: routerRoot } },
      },
    }),
  );
  const app = path.join(root, routerRoot);
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'index.tsx'), 'export default function Home() {}');
  return { root, app };
}

async function waitForDeclaration(filename, predicate) {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (fs.existsSync(filename) && predicate(fs.readFileSync(filename, 'utf8'))) return;
    await delay(20);
  }
  assert.fail(
    `typed route declarations did not reflect the route change: ${fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : 'missing declaration'}`,
  );
}

void test('typed routes update after adding and removing a custom-root route, and stop watching on close', async (t) => {
  const { root, app } = project(t, 'src/routes');
  let close;
  createExpoServicesPlugin(resolveExpoCompatibility(root)).configureServer({
    instance: {
      addHook(name, handler) {
        assert.equal(name, 'onClose');
        close = handler;
      },
    },
  });
  t.after(() => close?.());
  const declaration = path.join(root, '.expo/types/router.d.ts');
  const route = path.join(app, 'details.tsx');
  fs.writeFileSync(route, 'export default function Details() {}');
  await waitForDeclaration(declaration, (code) => code.includes('/details'));
  fs.unlinkSync(route);
  await waitForDeclaration(declaration, (code) => !code.includes('/details'));
  await close();
  const before = fs.readFileSync(declaration, 'utf8');
  fs.writeFileSync(route, 'export default function Details() {}');
  await delay(200);
  assert.equal(fs.readFileSync(declaration, 'utf8'), before);
});

void test('Router uses Expo custom-root resolution and updates its context for route additions and deletions', (t) => {
  const { root, app } = project(t, 'src/routes');
  const appRoot = getRouterRoot(resolveExpoCompatibility(root), {
    extra: { router: { root: 'src/routes' } },
  });
  assert.equal(appRoot, app);
  const plugin = createRouterPlugin(root, appRoot);
  const routerRoot = path.dirname(exampleRequire.resolve('expo-router/package.json'));
  const contextId = path.join(routerRoot, '_ctx.ios.js');
  const watched = new Set();
  const context = {
    addWatchFile(file) {
      watched.add(file);
    },
  };
  const load = () => plugin.load.handler.call(context, contextId);
  assert.match(load(), /index\.tsx/);
  const details = path.join(app, 'details.tsx');
  fs.writeFileSync(details, 'export default function Details() {}');
  assert.match(load(), /details\.tsx/);
  fs.unlinkSync(details);
  assert.doesNotMatch(load(), /details\.tsx/);
  assert.ok(watched.has(app));
});

void test('native-only configuration avoids SDK 58 implicit server exports without changing web.output', () => {
  const config = configureNativeRouter({
    web: { output: 'server' },
    extra: { router: { root: 'src/routes' } },
  });
  assert.equal(config.web.output, 'server');
  assert.equal(config.extra.router.apiRoutes, false);
  assert.equal(config.extra.router.root, 'src/routes');
  assert.throws(
    () => configureNativeRouter({ extra: { router: { apiRoutes: true } } }),
    /API route servers/,
  );
  assert.throws(
    () => configureNativeRouter({ experiments: { reactServerFunctions: true } }),
    /server functions/,
  );
});

void test('actual API routes fail explicitly instead of disappearing from native build output', (t) => {
  const { root, app } = project(t);
  fs.writeFileSync(path.join(app, 'hello+api.ts'), 'export function GET() {}');
  const plugin = createRouterPlugin(root, app);
  const id = path.join(
    path.dirname(exampleRequire.resolve('expo-router/package.json')),
    '_ctx.ios.js',
  );
  assert.throws(() => plugin.load.handler.call({ addWatchFile() {} }, id), /API route servers/);
});
