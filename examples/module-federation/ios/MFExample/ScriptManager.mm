#import "ScriptManager.h"

#import <React/RCTBridge+Private.h>
#import <React/RCTBridge.h>
#import <ReactCommon/CallInvoker.h>
#import <jsi/jsi.h>

using namespace facebook;

@interface ScriptManager () <RCTBridgeModule>
@end

@implementation ScriptManager {
  NSURLSession *_session;
}

RCT_EXPORT_MODULE(ScriptManager)

@synthesize bridge = _bridge;

- (instancetype)init {
  if (self = [super init]) {
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
    _session = [NSURLSession sessionWithConfiguration:config];
  }
  return self;
}

- (std::shared_ptr<facebook::react::TurboModule>)
    getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeScriptManagerSpecJSI>(params);
}

- (void)loadScript:(NSString *)scriptId
            config:(JS::NativeScriptManager::ScriptLocator &)config
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject {
  NSString *urlString = config.url();
  NSURL *url = [NSURL URLWithString:urlString];
  if (url == nil) {
    reject(@"EINVAL", [NSString stringWithFormat:@"Invalid URL: %@", urlString], nil);
    return;
  }

  __weak ScriptManager *weakSelf = self;
  NSURLSessionDataTask *task = [_session
      dataTaskWithURL:url
    completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
      if (error != nil) {
        reject(@"ENETWORK", error.localizedDescription, error);
        return;
      }
      NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
      if (httpResponse.statusCode < 200 || httpResponse.statusCode >= 300) {
        reject(@"EHTTP", [NSString stringWithFormat:@"HTTP %ld", (long)httpResponse.statusCode], nil);
        return;
      }
      if (data.length == 0) {
        reject(@"EEMPTY", @"Empty script body", nil);
        return;
      }
      [weakSelf evaluate:data sourceURL:urlString resolve:resolve reject:reject];
    }];
  [task resume];
}

- (void)evaluate:(NSData *)data
       sourceURL:(NSString *)sourceURL
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject {
  RCTCxxBridge *cxxBridge = (RCTCxxBridge *)self.bridge;
  jsi::Runtime *runtime = (jsi::Runtime *)cxxBridge.runtime;
  if (runtime == nullptr) {
    reject(@"ERUNTIME", @"JSI runtime is null", nil);
    return;
  }

  auto callInvoker = cxxBridge.jsCallInvoker;
  if (callInvoker == nullptr) {
    reject(@"ERUNTIME", @"CallInvoker is null", nil);
    return;
  }

  std::string scriptText(static_cast<const char *>(data.bytes), data.length);
  std::string url([sourceURL UTF8String]);

  callInvoker->invokeAsync([runtime, scriptText = std::move(scriptText), url = std::move(url), resolve, reject]() {
    try {
      auto buffer = std::make_shared<jsi::StringBuffer>(scriptText);
      runtime->evaluateJavaScript(buffer, url);
      resolve(nil);
    } catch (const jsi::JSError &error) {
      std::string detail = error.getMessage() + "\n" + error.getStack();
      reject(@"EEVAL", [NSString stringWithUTF8String:detail.c_str()], nil);
    } catch (const std::exception &error) {
      reject(@"EEVAL", [NSString stringWithUTF8String:error.what()], nil);
    }
  });
}

@end
