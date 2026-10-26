# Module Federation example

A React Native 0.84 host loads `remote_app/Counter` from a separate Rollipop dev server.

## Layout

| Path                                                     | Purpose                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/host/index.ts`                                      | Registers the host app.                                                 |
| `src/host/App.tsx`                                       | Loads the remote Counter with React Suspense.                           |
| `src/remote/index.ts`                                    | Remote entry.                                                           |
| `src/remote/exposed/Counter.tsx`                         | Exposed component.                                                      |
| `mf-script-loader.ts`                                    | Registers the native script loader through `runtime.implement`.         |
| `native/NativeScriptManager.ts`                          | Codegen TurboModule specification.                                      |
| `android/app/src/main/java/com/mfexample/scriptmanager/` | Kotlin module and package registration.                                 |
| `android/app/src/main/jni/`                              | JNI evaluation on the JavaScript thread.                                |
| `ios/MFExample/ScriptManager.h`, `ScriptManager.mm`      | iOS download and JSI evaluation; already included in the Xcode project. |
| `rollipop.host.config.ts`, `rollipop.remote.config.ts`   | Host and remote bundler configurations.                                 |

## Run

Install dependencies and build packages from the repository root with `yarn install` and `yarn build:all`, then run these commands from this directory in separate terminals:

```bash
# Remote: http://localhost:8082/index.bundle?platform=ios
yarn start:remote
```

```bash
# Host: port 8081
yarn start:host
```

```bash
# iOS dependencies, then the app
bundle install
yarn pod:install
yarn ios
# Or: yarn android
```

The host config uses the iOS remote URL above. Update its host and platform for the target environment. The remote container is appended to the remote entry bundle; there is no separate `remoteEntry.js` or chunk server.

## Static Bundles

The bundle scripts require an output path:

```bash
yarn bundle:host --platform ios --bundle-output dist/host.bundle
yarn bundle:remote --platform ios --bundle-output dist/remote.bundle
```

Static remotes use IIFE output; dev-server remotes use Rollipop output with their own HMR graph. See [Module Federation](https://rollipop.dev/docs/features/module-federation) for loader and sharing options.

## Native Integration

Android registers `ScriptManagerPackage` in `MainApplication.kt` and builds the JNI library through CMake. iOS compiles `ScriptManager.mm` in the app target. Codegen uses `MFExampleSpec` and the `native` directory from `package.json`.

The native loader downloads and evaluates the supplied URL. It does not implement signature verification, retry policies, or relative sub-chunk URL resolution. Runtime module caching and `retryRemote` are provided separately by the federation plugin.
