package com.mfexample.scriptmanager

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class ScriptManagerPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == ScriptManagerModule.NAME) ScriptManagerModule(reactContext) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(
            ScriptManagerModule.NAME to ReactModuleInfo(
                ScriptManagerModule.NAME,
                ScriptManagerModule::class.java.name,
                false,
                false,
                false,
                true,
            ),
        )
    }
}
