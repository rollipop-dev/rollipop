package com.mfexample.scriptmanager

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException

@OptIn(FrameworkAPI::class)
@ReactModule(name = ScriptManagerModule.NAME)
class ScriptManagerModule(private val reactContext: ReactApplicationContext) :
    NativeScriptManagerSpec(reactContext) {

    private val client = OkHttpClient()

    override fun getName(): String = NAME

    override fun loadScript(scriptId: String, config: ReadableMap, promise: Promise) {
        val url = config.getString("url")
            ?: return promise.reject("EINVAL", "url is required")

        val request = Request.Builder().url(url).build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                promise.reject("ENETWORK", e.message ?: e.toString())
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    promise.reject("EHTTP", "HTTP ${response.code}")
                    return
                }
                val bytes = response.body?.bytes()
                if (bytes == null || bytes.isEmpty()) {
                    promise.reject("EEMPTY", "Empty script body")
                    return
                }
                evaluate(bytes, url, promise)
            }
        })
    }

    private fun evaluate(script: ByteArray, url: String, promise: Promise) {
        val callInvoker = reactContext.catalystInstance?.jsCallInvokerHolder as? CallInvokerHolderImpl
            ?: return promise.reject("ERUNTIME", "CallInvoker is not available")
        val jsRuntime = reactContext.javaScriptContextHolder?.get()
            ?: return promise.reject("ERUNTIME", "JS runtime is not available")
        evaluateJavascriptAsync(jsRuntime, callInvoker, script, url, promise)
    }

    private external fun evaluateJavascriptAsync(
        jsRuntime: Long,
        callInvokerHolder: CallInvokerHolderImpl,
        code: ByteArray,
        url: String,
        promise: Any,
    )

    companion object {
        const val NAME = "ScriptManager"

        init {
            System.loadLibrary("script_manager")
        }
    }
}
