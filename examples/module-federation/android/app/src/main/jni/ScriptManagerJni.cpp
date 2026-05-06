#include <fbjni/fbjni.h>
#include <jsi/jsi.h>
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/CallInvokerHolder.h>

#include <memory>
#include <string>

using namespace facebook;

namespace {

class PromiseHolder : public jni::HybridClass<PromiseHolder> {
 public:
  static auto constexpr kJavaDescriptor = "Lcom/facebook/react/bridge/Promise;";
};

void resolvePromise(jni::alias_ref<jobject> promise) {
  static auto resolveMethod = jni::findClassStatic("com/facebook/react/bridge/Promise")
                                  ->getMethod<void(jni::alias_ref<jobject>)>("resolve");
  resolveMethod(promise, nullptr);
}

void rejectPromise(jni::alias_ref<jobject> promise, const std::string& code, const std::string& message) {
  static auto rejectMethod = jni::findClassStatic("com/facebook/react/bridge/Promise")
                                 ->getMethod<void(jni::alias_ref<jstring>, jni::alias_ref<jstring>)>("reject");
  rejectMethod(promise, jni::make_jstring(code), jni::make_jstring(message));
}

}  // namespace

extern "C" JNIEXPORT void JNICALL
Java_com_mfexample_scriptmanager_ScriptManagerModule_evaluateJavascriptAsync(
    JNIEnv* env,
    jobject /* this */,
    jlong jsRuntimePtr,
    jobject callInvokerHolder,
    jbyteArray code,
    jstring url,
    jobject promiseRef) {
  auto* runtime = reinterpret_cast<jsi::Runtime*>(jsRuntimePtr);
  if (runtime == nullptr) {
    auto promise = jni::adopt_local(promiseRef);
    rejectPromise(promise, "ERUNTIME", "JSI runtime is null");
    return;
  }

  auto callInvokerHolderRef = jni::adopt_local(
      static_cast<react::CallInvokerHolder::javaobject>(callInvokerHolder));
  auto callInvoker = jni::cthis(callInvokerHolderRef)->getCallInvoker();

  jsize codeLen = env->GetArrayLength(code);
  std::string scriptText;
  scriptText.resize(codeLen);
  env->GetByteArrayRegion(code, 0, codeLen, reinterpret_cast<jbyte*>(scriptText.data()));

  const char* urlChars = env->GetStringUTFChars(url, nullptr);
  std::string sourceUrl(urlChars);
  env->ReleaseStringUTFChars(url, urlChars);

  auto globalPromise = jni::make_global(jni::adopt_local(promiseRef));

  callInvoker->invokeAsync([runtime, scriptText = std::move(scriptText), sourceUrl = std::move(sourceUrl), globalPromise]() {
    try {
      auto buffer = std::make_shared<jsi::StringBuffer>(scriptText);
      runtime->evaluateJavaScript(buffer, sourceUrl);
      resolvePromise(globalPromise);
    } catch (const jsi::JSError& error) {
      rejectPromise(globalPromise, "EEVAL", error.getMessage());
    } catch (const std::exception& error) {
      rejectPromise(globalPromise, "EEVAL", error.what());
    }
  });
}
