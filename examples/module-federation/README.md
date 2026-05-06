# Module Federation example

A React Native 0.84 app that consumes a federated remote bundle through `@rollipop/plugin-module-federation`. One native project (`MFExample`) hosts two JavaScript bundles served by separate Rollipop dev servers — `host` (this app's UI) and `remote` (which exposes `./RemoteNavigator`).

## Layout

```
src/
├── host/                       # host bundle (entry: src/host/index.js)
│   ├── index.js                # AppRegistry.registerComponent('MFExample', App) + script loader registration
│   ├── App.tsx                 # consumes the remote via React.lazy(() => import('remote_app/RemoteNavigator'))
│   └── script-loader.ts        # ModuleFederationScriptLoader → NativeScriptManager
└── remote/                     # remote bundle (entry: src/remote/index.js, no UI of its own)
    ├── index.js                # empty entry — the bundle exists only to expose
    └── exposed/
        └── RemoteNavigator.tsx   # the federated component

native/
└── NativeScriptManager.ts      # codegen TurboModule spec

android/app/src/main/
├── java/com/mfexample/scriptmanager/
│   ├── ScriptManagerModule.kt  # OkHttp fetch + JNI evaluateJavascriptAsync
│   └── ScriptManagerPackage.kt # registered in MainApplication
└── jni/
    ├── CMakeLists.txt          # builds libscript_manager.so
    └── ScriptManagerJni.cpp    # JSI evaluateJavaScript on the JS thread

ios/MFExample/
├── ScriptManager.h
└── ScriptManager.mm            # NSURLSession fetch + JSI evaluateJavaScript

rollipop.host.config.ts
rollipop.remote.config.ts
```

## Run

Two dev servers — one per bundle:

```sh
# Terminal 1 — remote bundle (serves remoteEntry.js + chunks at http://localhost:8082)
yarn start:remote

# Terminal 2 — host bundle (the one the device connects to)
yarn start:host

# Terminal 3 — build + run the app
yarn pod:install   # iOS only, first time
yarn ios           # or: yarn android
```

The host's plugin config points at `http://localhost:8082/index.bundle?platform=ios` for `remote_app` — the remote dev server's main bundle URL is the federation container itself (the plugin overrides the entry to a virtual remote-entry module). Change the URL for your network/platform.

## Native module setup notes

This example uses a platform-specific TurboModule (Kotlin + Obj-C++). The native pieces live alongside the app code:

**Android.** `MainApplication.kt` registers `ScriptManagerPackage`. C++ JNI bindings are built via `externalNativeBuild` (`android/app/src/main/jni/CMakeLists.txt`). OkHttp is added as a direct dependency in `android/app/build.gradle`.

**iOS.** `ios/MFExample/ScriptManager.{h,mm}` must be added to the `MFExample` target in Xcode (drag the files into the project navigator and check the `MFExample` target in the file inspector). Codegen produces the `MFExampleSpec` framework headers at pod install time.

**Codegen.** `package.json` declares `codegenConfig` with `name: "MFExampleSpec"` and `jsSrcsDir: "./native"`. Codegen runs as part of `yarn pod:install` (iOS) and the gradle build (Android), generating:

- iOS: `ios/build/generated/ios/MFExampleSpec/MFExampleSpec.h`
- Android: abstract `NativeScriptManagerSpec` Kotlin class under the configured `javaPackageName`

## Known limitations

- The bundled `ios/MFExample.xcodeproj/project.pbxproj` does **not** yet reference `ScriptManager.{h,mm}` — they need to be added to the target manually. Same for any future native source files.
- The C++ JNI side and the Obj-C++ side reference framework headers (`fbjni`, `ReactCommon/CallInvoker.h`, `MFExampleSpec/MFExampleSpec.h`) that are only available during a real build. IDE diagnostics will flag them as missing until the first successful build.
- Code-signing, retry, caching, and sub-chunk URL rebasing are not implemented — `loadScript` simply downloads the URL it is given and runs it. Add those in `script-loader.ts` or in the native module if you need them.
