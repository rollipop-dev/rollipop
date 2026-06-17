var __BUNDLE_START_TIME__ = globalThis.nativePerformanceNow ? nativePerformanceNow() : Date.now();
var __DEV__ = false;
var process = globalThis.process || {};
process.env = process.env || {};
process.env.NODE_ENV = process.env.NODE_ENV || "production";
(function(global) {
//#region \0rollipop/runtime
var __rollipop_modules__ = {};
var __rollipop_module_cache = {};
function  __rollipop_require__(id) {
  var cached = __rollipop_module_cache[id];
  if (cached !== undefined) return cached.exports;
  var factory = __rollipop_modules__[id];
  if (factory === undefined) throw new Error('Module ' + id + ' is not registered');
  var module = __rollipop_module_cache[id] = { id: id, loaded: false, exports: {} };
  factory.call(module.exports, global, module, module.exports, __rollipop_require__);
  module.loaded = true;
  return module.exports;
}
function __rollipop_define__(factory, id) {
  __rollipop_modules__[id] = factory;
}
__rollipop_require__.m = __rollipop_modules__;
__rollipop_require__.c = __rollipop_module_cache;
__rollipop_require__.o = function(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
};
__rollipop_require__.d = function(exports, getters) {
  for (var key in getters) {
    if (__rollipop_require__.o(getters, key) && !__rollipop_require__.o(exports, key)) {
      Object.defineProperty(exports, key, { get: getters[key], enumerable: true });
    }
  }
};
__rollipop_require__.r = function(exports) {
  if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
  }
  Object.defineProperty(exports, '__esModule', { value: true });
};
__rollipop_require__.t = function(mod, nodeMode) {
  var target = mod != null ? Object.create(Object.getPrototypeOf(mod)) : {};
  if (nodeMode || !mod || !mod.__esModule) Object.defineProperty(target, 'default', { value: mod, enumerable: true });
  if (mod != null) {
    var keys = Object.getOwnPropertyNames(mod);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (__rollipop_require__.o(target, key)) continue;
      (function(k) {
        var desc = Object.getOwnPropertyDescriptor(mod, k);
        Object.defineProperty(target, k, { get: function() { return mod[k] }, enumerable: !desc || desc.enumerable });
      })(key);
    }
  }
  return target;
};
__rollipop_require__.re = function(exports, ns) {
  for (var key in ns) {
    if (key === 'default' || key === '__esModule' || __rollipop_require__.o(exports, key)) continue;
    (function(k) {
      Object.defineProperty(exports, k, { get: function() { return ns[k] }, enumerable: true });
    })(key);
  }
};
__rollipop_require__.e = function(id) {
  throw new Error('External module ' + id + ' is not available');
};
//#endregion
__rollipop_define__(function(global, module, __rollipop_exports__, __rollipop_require__) {
//#region index.ts
	__rollipop_require__.r(__rollipop_exports__);
	console.log("main entry");

//#endregion
}, 2);

__rollipop_define__(function(global, module, __rollipop_exports__, __rollipop_require__) {
//#region \0rollipop/entry
	__rollipop_require__.r(__rollipop_exports__);
	var import_prelude_10 = __rollipop_require__(2);

//#endregion
}, 1);

__rollipop_require__(1);
})(typeof globalThis !== 'undefined' ? globalThis : this);
/* FUNCTION_OVERRIDE */
//# sourceMappingURL=bundle.js.map