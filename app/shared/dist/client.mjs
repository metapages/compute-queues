var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../root/.cache/deno/deno_esbuild/registry.npmjs.org/fetch-retry@5.0.6/node_modules/fetch-retry/dist/fetch-retry.umd.js
var require_fetch_retry_umd = __commonJS({
  "../../../root/.cache/deno/deno_esbuild/registry.npmjs.org/fetch-retry@5.0.6/node_modules/fetch-retry/dist/fetch-retry.umd.js"(exports, module) {
    (function(global, factory) {
      typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, global.fetchRetry = factory());
    })(exports, function() {
      "use strict";
      var fetchRetry2 = function(fetch2, defaults) {
        defaults = defaults || {};
        if (typeof fetch2 !== "function") {
          throw new ArgumentError("fetch must be a function");
        }
        if (typeof defaults !== "object") {
          throw new ArgumentError("defaults must be an object");
        }
        if (defaults.retries !== void 0 && !isPositiveInteger(defaults.retries)) {
          throw new ArgumentError("retries must be a positive integer");
        }
        if (defaults.retryDelay !== void 0 && !isPositiveInteger(defaults.retryDelay) && typeof defaults.retryDelay !== "function") {
          throw new ArgumentError("retryDelay must be a positive integer or a function returning a positive integer");
        }
        if (defaults.retryOn !== void 0 && !Array.isArray(defaults.retryOn) && typeof defaults.retryOn !== "function") {
          throw new ArgumentError("retryOn property expects an array or function");
        }
        var baseDefaults = {
          retries: 3,
          retryDelay: 1e3,
          retryOn: []
        };
        defaults = Object.assign(baseDefaults, defaults);
        return function fetchRetry3(input, init) {
          var retries = defaults.retries;
          var retryDelay = defaults.retryDelay;
          var retryOn = defaults.retryOn;
          if (init && init.retries !== void 0) {
            if (isPositiveInteger(init.retries)) {
              retries = init.retries;
            } else {
              throw new ArgumentError("retries must be a positive integer");
            }
          }
          if (init && init.retryDelay !== void 0) {
            if (isPositiveInteger(init.retryDelay) || typeof init.retryDelay === "function") {
              retryDelay = init.retryDelay;
            } else {
              throw new ArgumentError("retryDelay must be a positive integer or a function returning a positive integer");
            }
          }
          if (init && init.retryOn) {
            if (Array.isArray(init.retryOn) || typeof init.retryOn === "function") {
              retryOn = init.retryOn;
            } else {
              throw new ArgumentError("retryOn property expects an array or function");
            }
          }
          return new Promise(function(resolve, reject) {
            var wrappedFetch = function(attempt) {
              var _input = typeof Request !== "undefined" && input instanceof Request ? input.clone() : input;
              fetch2(_input, init).then(function(response) {
                if (Array.isArray(retryOn) && retryOn.indexOf(response.status) === -1) {
                  resolve(response);
                } else if (typeof retryOn === "function") {
                  try {
                    return Promise.resolve(retryOn(attempt, null, response)).then(function(retryOnResponse) {
                      if (retryOnResponse) {
                        retry(attempt, null, response);
                      } else {
                        resolve(response);
                      }
                    }).catch(reject);
                  } catch (error) {
                    reject(error);
                  }
                } else {
                  if (attempt < retries) {
                    retry(attempt, null, response);
                  } else {
                    resolve(response);
                  }
                }
              }).catch(function(error) {
                if (typeof retryOn === "function") {
                  try {
                    Promise.resolve(retryOn(attempt, error, null)).then(function(retryOnResponse) {
                      if (retryOnResponse) {
                        retry(attempt, error, null);
                      } else {
                        reject(error);
                      }
                    }).catch(function(error2) {
                      reject(error2);
                    });
                  } catch (error2) {
                    reject(error2);
                  }
                } else if (attempt < retries) {
                  retry(attempt, error, null);
                } else {
                  reject(error);
                }
              });
            };
            function retry(attempt, error, response) {
              var delay = typeof retryDelay === "function" ? retryDelay(attempt, error, response) : retryDelay;
              setTimeout(function() {
                wrappedFetch(++attempt);
              }, delay);
            }
            wrappedFetch(0);
          });
        };
      };
      function isPositiveInteger(value) {
        return Number.isInteger(value) && value >= 0;
      }
      function ArgumentError(message) {
        this.name = "ArgumentError";
        this.message = message;
      }
      return fetchRetry2;
    });
  }
});

// ../../../root/.cache/deno/deno_esbuild/registry.npmjs.org/safe-stable-stringify@2.4.3/node_modules/safe-stable-stringify/index.js
var require_safe_stable_stringify = __commonJS({
  "../../../root/.cache/deno/deno_esbuild/registry.npmjs.org/safe-stable-stringify@2.4.3/node_modules/safe-stable-stringify/index.js"(exports, module) {
    "use strict";
    var { hasOwnProperty } = Object.prototype;
    var stringify = configure2();
    stringify.configure = configure2;
    stringify.stringify = stringify;
    stringify.default = stringify;
    exports.stringify = stringify;
    exports.configure = configure2;
    module.exports = stringify;
    var strEscapeSequencesRegExp = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]|[\ud800-\udbff](?![\udc00-\udfff])|(?:[^\ud800-\udbff]|^)[\udc00-\udfff]/;
    function strEscape(str) {
      if (str.length < 5e3 && !strEscapeSequencesRegExp.test(str)) {
        return `"${str}"`;
      }
      return JSON.stringify(str);
    }
    function insertSort(array) {
      if (array.length > 200) {
        return array.sort();
      }
      for (let i = 1; i < array.length; i++) {
        const currentValue = array[i];
        let position = i;
        while (position !== 0 && array[position - 1] > currentValue) {
          array[position] = array[position - 1];
          position--;
        }
        array[position] = currentValue;
      }
      return array;
    }
    var typedArrayPrototypeGetSymbolToStringTag = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(
        Object.getPrototypeOf(
          new Int8Array()
        )
      ),
      Symbol.toStringTag
    ).get;
    function isTypedArrayWithEntries(value) {
      return typedArrayPrototypeGetSymbolToStringTag.call(value) !== void 0 && value.length !== 0;
    }
    function stringifyTypedArray(array, separator, maximumBreadth) {
      if (array.length < maximumBreadth) {
        maximumBreadth = array.length;
      }
      const whitespace = separator === "," ? "" : " ";
      let res = `"0":${whitespace}${array[0]}`;
      for (let i = 1; i < maximumBreadth; i++) {
        res += `${separator}"${i}":${whitespace}${array[i]}`;
      }
      return res;
    }
    function getCircularValueOption(options) {
      if (hasOwnProperty.call(options, "circularValue")) {
        const circularValue = options.circularValue;
        if (typeof circularValue === "string") {
          return `"${circularValue}"`;
        }
        if (circularValue == null) {
          return circularValue;
        }
        if (circularValue === Error || circularValue === TypeError) {
          return {
            toString() {
              throw new TypeError("Converting circular structure to JSON");
            }
          };
        }
        throw new TypeError('The "circularValue" argument must be of type string or the value null or undefined');
      }
      return '"[Circular]"';
    }
    function getBooleanOption(options, key) {
      let value;
      if (hasOwnProperty.call(options, key)) {
        value = options[key];
        if (typeof value !== "boolean") {
          throw new TypeError(`The "${key}" argument must be of type boolean`);
        }
      }
      return value === void 0 ? true : value;
    }
    function getPositiveIntegerOption(options, key) {
      let value;
      if (hasOwnProperty.call(options, key)) {
        value = options[key];
        if (typeof value !== "number") {
          throw new TypeError(`The "${key}" argument must be of type number`);
        }
        if (!Number.isInteger(value)) {
          throw new TypeError(`The "${key}" argument must be an integer`);
        }
        if (value < 1) {
          throw new RangeError(`The "${key}" argument must be >= 1`);
        }
      }
      return value === void 0 ? Infinity : value;
    }
    function getItemCount(number) {
      if (number === 1) {
        return "1 item";
      }
      return `${number} items`;
    }
    function getUniqueReplacerSet(replacerArray) {
      const replacerSet = /* @__PURE__ */ new Set();
      for (const value of replacerArray) {
        if (typeof value === "string" || typeof value === "number") {
          replacerSet.add(String(value));
        }
      }
      return replacerSet;
    }
    function getStrictOption(options) {
      if (hasOwnProperty.call(options, "strict")) {
        const value = options.strict;
        if (typeof value !== "boolean") {
          throw new TypeError('The "strict" argument must be of type boolean');
        }
        if (value) {
          return (value2) => {
            let message = `Object can not safely be stringified. Received type ${typeof value2}`;
            if (typeof value2 !== "function") message += ` (${value2.toString()})`;
            throw new Error(message);
          };
        }
      }
    }
    function configure2(options) {
      options = { ...options };
      const fail = getStrictOption(options);
      if (fail) {
        if (options.bigint === void 0) {
          options.bigint = false;
        }
        if (!("circularValue" in options)) {
          options.circularValue = Error;
        }
      }
      const circularValue = getCircularValueOption(options);
      const bigint = getBooleanOption(options, "bigint");
      const deterministic = getBooleanOption(options, "deterministic");
      const maximumDepth = getPositiveIntegerOption(options, "maximumDepth");
      const maximumBreadth = getPositiveIntegerOption(options, "maximumBreadth");
      function stringifyFnReplacer(key, parent, stack, replacer, spacer, indentation) {
        let value = parent[key];
        if (typeof value === "object" && value !== null && typeof value.toJSON === "function") {
          value = value.toJSON(key);
        }
        value = replacer.call(parent, key, value);
        switch (typeof value) {
          case "string":
            return strEscape(value);
          case "object": {
            if (value === null) {
              return "null";
            }
            if (stack.indexOf(value) !== -1) {
              return circularValue;
            }
            let res = "";
            let join = ",";
            const originalIndentation = indentation;
            if (Array.isArray(value)) {
              if (value.length === 0) {
                return "[]";
              }
              if (maximumDepth < stack.length + 1) {
                return '"[Array]"';
              }
              stack.push(value);
              if (spacer !== "") {
                indentation += spacer;
                res += `
${indentation}`;
                join = `,
${indentation}`;
              }
              const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
              let i = 0;
              for (; i < maximumValuesToStringify - 1; i++) {
                const tmp2 = stringifyFnReplacer(String(i), value, stack, replacer, spacer, indentation);
                res += tmp2 !== void 0 ? tmp2 : "null";
                res += join;
              }
              const tmp = stringifyFnReplacer(String(i), value, stack, replacer, spacer, indentation);
              res += tmp !== void 0 ? tmp : "null";
              if (value.length - 1 > maximumBreadth) {
                const removedKeys = value.length - maximumBreadth - 1;
                res += `${join}"... ${getItemCount(removedKeys)} not stringified"`;
              }
              if (spacer !== "") {
                res += `
${originalIndentation}`;
              }
              stack.pop();
              return `[${res}]`;
            }
            let keys = Object.keys(value);
            const keyLength = keys.length;
            if (keyLength === 0) {
              return "{}";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Object]"';
            }
            let whitespace = "";
            let separator = "";
            if (spacer !== "") {
              indentation += spacer;
              join = `,
${indentation}`;
              whitespace = " ";
            }
            const maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
            if (deterministic && !isTypedArrayWithEntries(value)) {
              keys = insertSort(keys);
            }
            stack.push(value);
            for (let i = 0; i < maximumPropertiesToStringify; i++) {
              const key2 = keys[i];
              const tmp = stringifyFnReplacer(key2, value, stack, replacer, spacer, indentation);
              if (tmp !== void 0) {
                res += `${separator}${strEscape(key2)}:${whitespace}${tmp}`;
                separator = join;
              }
            }
            if (keyLength > maximumBreadth) {
              const removedKeys = keyLength - maximumBreadth;
              res += `${separator}"...":${whitespace}"${getItemCount(removedKeys)} not stringified"`;
              separator = join;
            }
            if (spacer !== "" && separator.length > 1) {
              res = `
${indentation}${res}
${originalIndentation}`;
            }
            stack.pop();
            return `{${res}}`;
          }
          case "number":
            return isFinite(value) ? String(value) : fail ? fail(value) : "null";
          case "boolean":
            return value === true ? "true" : "false";
          case "undefined":
            return void 0;
          case "bigint":
            if (bigint) {
              return String(value);
            }
          // fallthrough
          default:
            return fail ? fail(value) : void 0;
        }
      }
      function stringifyArrayReplacer(key, value, stack, replacer, spacer, indentation) {
        if (typeof value === "object" && value !== null && typeof value.toJSON === "function") {
          value = value.toJSON(key);
        }
        switch (typeof value) {
          case "string":
            return strEscape(value);
          case "object": {
            if (value === null) {
              return "null";
            }
            if (stack.indexOf(value) !== -1) {
              return circularValue;
            }
            const originalIndentation = indentation;
            let res = "";
            let join = ",";
            if (Array.isArray(value)) {
              if (value.length === 0) {
                return "[]";
              }
              if (maximumDepth < stack.length + 1) {
                return '"[Array]"';
              }
              stack.push(value);
              if (spacer !== "") {
                indentation += spacer;
                res += `
${indentation}`;
                join = `,
${indentation}`;
              }
              const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
              let i = 0;
              for (; i < maximumValuesToStringify - 1; i++) {
                const tmp2 = stringifyArrayReplacer(String(i), value[i], stack, replacer, spacer, indentation);
                res += tmp2 !== void 0 ? tmp2 : "null";
                res += join;
              }
              const tmp = stringifyArrayReplacer(String(i), value[i], stack, replacer, spacer, indentation);
              res += tmp !== void 0 ? tmp : "null";
              if (value.length - 1 > maximumBreadth) {
                const removedKeys = value.length - maximumBreadth - 1;
                res += `${join}"... ${getItemCount(removedKeys)} not stringified"`;
              }
              if (spacer !== "") {
                res += `
${originalIndentation}`;
              }
              stack.pop();
              return `[${res}]`;
            }
            stack.push(value);
            let whitespace = "";
            if (spacer !== "") {
              indentation += spacer;
              join = `,
${indentation}`;
              whitespace = " ";
            }
            let separator = "";
            for (const key2 of replacer) {
              const tmp = stringifyArrayReplacer(key2, value[key2], stack, replacer, spacer, indentation);
              if (tmp !== void 0) {
                res += `${separator}${strEscape(key2)}:${whitespace}${tmp}`;
                separator = join;
              }
            }
            if (spacer !== "" && separator.length > 1) {
              res = `
${indentation}${res}
${originalIndentation}`;
            }
            stack.pop();
            return `{${res}}`;
          }
          case "number":
            return isFinite(value) ? String(value) : fail ? fail(value) : "null";
          case "boolean":
            return value === true ? "true" : "false";
          case "undefined":
            return void 0;
          case "bigint":
            if (bigint) {
              return String(value);
            }
          // fallthrough
          default:
            return fail ? fail(value) : void 0;
        }
      }
      function stringifyIndent(key, value, stack, spacer, indentation) {
        switch (typeof value) {
          case "string":
            return strEscape(value);
          case "object": {
            if (value === null) {
              return "null";
            }
            if (typeof value.toJSON === "function") {
              value = value.toJSON(key);
              if (typeof value !== "object") {
                return stringifyIndent(key, value, stack, spacer, indentation);
              }
              if (value === null) {
                return "null";
              }
            }
            if (stack.indexOf(value) !== -1) {
              return circularValue;
            }
            const originalIndentation = indentation;
            if (Array.isArray(value)) {
              if (value.length === 0) {
                return "[]";
              }
              if (maximumDepth < stack.length + 1) {
                return '"[Array]"';
              }
              stack.push(value);
              indentation += spacer;
              let res2 = `
${indentation}`;
              const join2 = `,
${indentation}`;
              const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
              let i = 0;
              for (; i < maximumValuesToStringify - 1; i++) {
                const tmp2 = stringifyIndent(String(i), value[i], stack, spacer, indentation);
                res2 += tmp2 !== void 0 ? tmp2 : "null";
                res2 += join2;
              }
              const tmp = stringifyIndent(String(i), value[i], stack, spacer, indentation);
              res2 += tmp !== void 0 ? tmp : "null";
              if (value.length - 1 > maximumBreadth) {
                const removedKeys = value.length - maximumBreadth - 1;
                res2 += `${join2}"... ${getItemCount(removedKeys)} not stringified"`;
              }
              res2 += `
${originalIndentation}`;
              stack.pop();
              return `[${res2}]`;
            }
            let keys = Object.keys(value);
            const keyLength = keys.length;
            if (keyLength === 0) {
              return "{}";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Object]"';
            }
            indentation += spacer;
            const join = `,
${indentation}`;
            let res = "";
            let separator = "";
            let maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
            if (isTypedArrayWithEntries(value)) {
              res += stringifyTypedArray(value, join, maximumBreadth);
              keys = keys.slice(value.length);
              maximumPropertiesToStringify -= value.length;
              separator = join;
            }
            if (deterministic) {
              keys = insertSort(keys);
            }
            stack.push(value);
            for (let i = 0; i < maximumPropertiesToStringify; i++) {
              const key2 = keys[i];
              const tmp = stringifyIndent(key2, value[key2], stack, spacer, indentation);
              if (tmp !== void 0) {
                res += `${separator}${strEscape(key2)}: ${tmp}`;
                separator = join;
              }
            }
            if (keyLength > maximumBreadth) {
              const removedKeys = keyLength - maximumBreadth;
              res += `${separator}"...": "${getItemCount(removedKeys)} not stringified"`;
              separator = join;
            }
            if (separator !== "") {
              res = `
${indentation}${res}
${originalIndentation}`;
            }
            stack.pop();
            return `{${res}}`;
          }
          case "number":
            return isFinite(value) ? String(value) : fail ? fail(value) : "null";
          case "boolean":
            return value === true ? "true" : "false";
          case "undefined":
            return void 0;
          case "bigint":
            if (bigint) {
              return String(value);
            }
          // fallthrough
          default:
            return fail ? fail(value) : void 0;
        }
      }
      function stringifySimple(key, value, stack) {
        switch (typeof value) {
          case "string":
            return strEscape(value);
          case "object": {
            if (value === null) {
              return "null";
            }
            if (typeof value.toJSON === "function") {
              value = value.toJSON(key);
              if (typeof value !== "object") {
                return stringifySimple(key, value, stack);
              }
              if (value === null) {
                return "null";
              }
            }
            if (stack.indexOf(value) !== -1) {
              return circularValue;
            }
            let res = "";
            if (Array.isArray(value)) {
              if (value.length === 0) {
                return "[]";
              }
              if (maximumDepth < stack.length + 1) {
                return '"[Array]"';
              }
              stack.push(value);
              const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
              let i = 0;
              for (; i < maximumValuesToStringify - 1; i++) {
                const tmp2 = stringifySimple(String(i), value[i], stack);
                res += tmp2 !== void 0 ? tmp2 : "null";
                res += ",";
              }
              const tmp = stringifySimple(String(i), value[i], stack);
              res += tmp !== void 0 ? tmp : "null";
              if (value.length - 1 > maximumBreadth) {
                const removedKeys = value.length - maximumBreadth - 1;
                res += `,"... ${getItemCount(removedKeys)} not stringified"`;
              }
              stack.pop();
              return `[${res}]`;
            }
            let keys = Object.keys(value);
            const keyLength = keys.length;
            if (keyLength === 0) {
              return "{}";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Object]"';
            }
            let separator = "";
            let maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
            if (isTypedArrayWithEntries(value)) {
              res += stringifyTypedArray(value, ",", maximumBreadth);
              keys = keys.slice(value.length);
              maximumPropertiesToStringify -= value.length;
              separator = ",";
            }
            if (deterministic) {
              keys = insertSort(keys);
            }
            stack.push(value);
            for (let i = 0; i < maximumPropertiesToStringify; i++) {
              const key2 = keys[i];
              const tmp = stringifySimple(key2, value[key2], stack);
              if (tmp !== void 0) {
                res += `${separator}${strEscape(key2)}:${tmp}`;
                separator = ",";
              }
            }
            if (keyLength > maximumBreadth) {
              const removedKeys = keyLength - maximumBreadth;
              res += `${separator}"...":"${getItemCount(removedKeys)} not stringified"`;
            }
            stack.pop();
            return `{${res}}`;
          }
          case "number":
            return isFinite(value) ? String(value) : fail ? fail(value) : "null";
          case "boolean":
            return value === true ? "true" : "false";
          case "undefined":
            return void 0;
          case "bigint":
            if (bigint) {
              return String(value);
            }
          // fallthrough
          default:
            return fail ? fail(value) : void 0;
        }
      }
      function stringify2(value, replacer, space) {
        if (arguments.length > 1) {
          let spacer = "";
          if (typeof space === "number") {
            spacer = " ".repeat(Math.min(space, 10));
          } else if (typeof space === "string") {
            spacer = space.slice(0, 10);
          }
          if (replacer != null) {
            if (typeof replacer === "function") {
              return stringifyFnReplacer("", { "": value }, [], replacer, spacer, "");
            }
            if (Array.isArray(replacer)) {
              return stringifyArrayReplacer("", value, [], getUniqueReplacerSet(replacer), spacer, "");
            }
          }
          if (spacer.length !== 0) {
            return stringifyIndent("", value, [], spacer, "");
          }
        }
        return stringifySimple("", value, []);
      }
      return stringify2;
    }
  }
});

// ../../../root/.cache/deno/deno_esbuild/registry.npmjs.org/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/es6/index.js
var require_es6 = __commonJS({
  "../../../root/.cache/deno/deno_esbuild/registry.npmjs.org/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/es6/index.js"(exports, module) {
    "use strict";
    module.exports = function equal2(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal2(a[i], b[i])) return false;
          return true;
        }
        if (a instanceof Map && b instanceof Map) {
          if (a.size !== b.size) return false;
          for (i of a.entries())
            if (!b.has(i[0])) return false;
          for (i of a.entries())
            if (!equal2(i[1], b.get(i[0]))) return false;
          return true;
        }
        if (a instanceof Set && b instanceof Set) {
          if (a.size !== b.size) return false;
          for (i of a.entries())
            if (!b.has(i[0])) return false;
          return true;
        }
        if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (a[i] !== b[i]) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal2(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// src/shared/types.ts
var DataRefType = /* @__PURE__ */ ((DataRefType2) => {
  DataRefType2["base64"] = "base64";
  DataRefType2["url"] = "url";
  DataRefType2["utf8"] = "utf8";
  DataRefType2["json"] = "json";
  DataRefType2["key"] = "key";
  return DataRefType2;
})(DataRefType || {});
var DataRefTypeKeys = Object.keys(DataRefType).filter(
  (key) => isNaN(Number(key))
);
var DataRefTypesSet = new Set(DataRefTypeKeys);
var DataRefTypeDefault = "utf8" /* utf8 */;
var isDataRef = (value) => {
  return !!(value && typeof value === "object" && value?.type && DataRefTypesSet.has(value.type) && value?.value);
};
var DockerJobState = /* @__PURE__ */ ((DockerJobState2) => {
  DockerJobState2["Queued"] = "Queued";
  DockerJobState2["ReQueued"] = "ReQueued";
  DockerJobState2["Running"] = "Running";
  DockerJobState2["Finished"] = "Finished";
  return DockerJobState2;
})(DockerJobState || {});
var DockerJobFinishedReason = /* @__PURE__ */ ((DockerJobFinishedReason2) => {
  DockerJobFinishedReason2["Cancelled"] = "Cancelled";
  DockerJobFinishedReason2["TimedOut"] = "TimedOut";
  DockerJobFinishedReason2["Success"] = "Success";
  DockerJobFinishedReason2["Error"] = "Error";
  DockerJobFinishedReason2["WorkerLost"] = "WorkerLost";
  DockerJobFinishedReason2["JobReplacedByClient"] = "JobReplacedByClient";
  return DockerJobFinishedReason2;
})(DockerJobFinishedReason || {});
var isDockerJobDefinitionRowFinished = (row) => {
  return row.state === "Finished" /* Finished */;
};
var getFinishedJobState = (row) => {
  if (isDockerJobDefinitionRowFinished(row)) {
    return row.value;
  }
};
var WebsocketMessageTypeWorkerToServer = /* @__PURE__ */ ((WebsocketMessageTypeWorkerToServer2) => {
  WebsocketMessageTypeWorkerToServer2["StateChange"] = "StateChange";
  WebsocketMessageTypeWorkerToServer2["WorkerRegistration"] = "WorkerRegistration";
  WebsocketMessageTypeWorkerToServer2["WorkerStatusResponse"] = "WorkerStatusResponse";
  WebsocketMessageTypeWorkerToServer2["JobStatusLogs"] = "JobStatusLogs";
  return WebsocketMessageTypeWorkerToServer2;
})(WebsocketMessageTypeWorkerToServer || {});
var WebsocketMessageTypeClientToServer = /* @__PURE__ */ ((WebsocketMessageTypeClientToServer2) => {
  WebsocketMessageTypeClientToServer2["StateChange"] = "StateChange";
  WebsocketMessageTypeClientToServer2["ClearJobCache"] = "ClearJobCache";
  WebsocketMessageTypeClientToServer2["ResubmitJob"] = "ResubmitJob";
  WebsocketMessageTypeClientToServer2["QueryJob"] = "QueryJob";
  return WebsocketMessageTypeClientToServer2;
})(WebsocketMessageTypeClientToServer || {});
var WebsocketMessageTypeServerBroadcast = /* @__PURE__ */ ((WebsocketMessageTypeServerBroadcast2) => {
  WebsocketMessageTypeServerBroadcast2["JobStates"] = "JobStates";
  WebsocketMessageTypeServerBroadcast2["JobStateUpdates"] = "JobStateUpdates";
  WebsocketMessageTypeServerBroadcast2["JobStatusPayload"] = "JobStatusPayload";
  WebsocketMessageTypeServerBroadcast2["Workers"] = "Workers";
  WebsocketMessageTypeServerBroadcast2["StatusRequest"] = "StatusRequest";
  WebsocketMessageTypeServerBroadcast2["ClearJobCache"] = "ClearJobCache";
  WebsocketMessageTypeServerBroadcast2["ClearJobCacheConfirm"] = "ClearJobCacheConfirm";
  return WebsocketMessageTypeServerBroadcast2;
})(WebsocketMessageTypeServerBroadcast || {});
var isJobCacheAllowedToBeDeleted = (state) => {
  switch (state.state) {
    case "Queued" /* Queued */:
    case "ReQueued" /* ReQueued */:
    case "Running" /* Running */:
      return false;
    case "Finished" /* Finished */:
      return true;
    default:
      return false;
  }
};

// src/shared/util.ts
var import_fetch_retry = __toESM(require_fetch_retry_umd());

// ../../../root/.cache/deno/deno_esbuild/registry.npmjs.org/mutative@1.0.11/node_modules/mutative/dist/mutative.esm.mjs
var Operation = {
  Remove: "remove",
  Replace: "replace",
  Add: "add"
};
var PROXY_DRAFT = Symbol.for("__MUTATIVE_PROXY_DRAFT__");
var RAW_RETURN_SYMBOL = Symbol("__MUTATIVE_RAW_RETURN_SYMBOL__");
var iteratorSymbol = Symbol.iterator;
var dataTypes = {
  mutable: "mutable",
  immutable: "immutable"
};
var internal = {};
function has(target, key) {
  return target instanceof Map ? target.has(key) : Object.prototype.hasOwnProperty.call(target, key);
}
function getDescriptor(target, key) {
  if (key in target) {
    let prototype = Reflect.getPrototypeOf(target);
    while (prototype) {
      const descriptor = Reflect.getOwnPropertyDescriptor(prototype, key);
      if (descriptor)
        return descriptor;
      prototype = Reflect.getPrototypeOf(prototype);
    }
  }
  return;
}
function latest(proxyDraft) {
  var _a;
  return (_a = proxyDraft.copy) !== null && _a !== void 0 ? _a : proxyDraft.original;
}
function isDraft(target) {
  return !!getProxyDraft(target);
}
function getProxyDraft(value) {
  if (typeof value !== "object")
    return null;
  return value === null || value === void 0 ? void 0 : value[PROXY_DRAFT];
}
function getValue(value) {
  var _a;
  const proxyDraft = getProxyDraft(value);
  return proxyDraft ? (_a = proxyDraft.copy) !== null && _a !== void 0 ? _a : proxyDraft.original : value;
}
function isDraftable(value, options) {
  if (!value || typeof value !== "object")
    return false;
  let markResult;
  return Object.getPrototypeOf(value) === Object.prototype || Array.isArray(value) || value instanceof Map || value instanceof Set || !!(options === null || options === void 0 ? void 0 : options.mark) && ((markResult = options.mark(value, dataTypes)) === dataTypes.immutable || typeof markResult === "function");
}
function getPath(target, path = []) {
  if (Object.hasOwnProperty.call(target, "key")) {
    const parentCopy = target.parent.copy;
    const proxyDraft = getProxyDraft(get(parentCopy, target.key));
    if (proxyDraft !== null && (proxyDraft === null || proxyDraft === void 0 ? void 0 : proxyDraft.original) !== target.original) {
      return null;
    }
    const isSet = target.parent.type === 3;
    const key = isSet ? Array.from(target.parent.setMap.keys()).indexOf(target.key) : target.key;
    if (!(isSet && parentCopy.size > key || has(parentCopy, key)))
      return null;
    path.push(key);
  }
  if (target.parent) {
    return getPath(target.parent, path);
  }
  path.reverse();
  try {
    resolvePath(target.copy, path);
  } catch (e) {
    return null;
  }
  return path;
}
function getType(target) {
  if (Array.isArray(target))
    return 1;
  if (target instanceof Map)
    return 2;
  if (target instanceof Set)
    return 3;
  return 0;
}
function get(target, key) {
  return getType(target) === 2 ? target.get(key) : target[key];
}
function set(target, key, value) {
  const type = getType(target);
  if (type === 2) {
    target.set(key, value);
  } else {
    target[key] = value;
  }
}
function peek(target, key) {
  const state = getProxyDraft(target);
  const source = state ? latest(state) : target;
  return source[key];
}
function isEqual(x, y) {
  if (x === y) {
    return x !== 0 || 1 / x === 1 / y;
  } else {
    return x !== x && y !== y;
  }
}
function revokeProxy(proxyDraft) {
  if (!proxyDraft)
    return;
  while (proxyDraft.finalities.revoke.length > 0) {
    const revoke = proxyDraft.finalities.revoke.pop();
    revoke();
  }
}
function escapePath(path, pathAsArray) {
  return pathAsArray ? path : [""].concat(path).map((_item) => {
    const item = `${_item}`;
    if (item.indexOf("/") === -1 && item.indexOf("~") === -1)
      return item;
    return item.replace(/~/g, "~0").replace(/\//g, "~1");
  }).join("/");
}
function resolvePath(base, path) {
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    base = get(getType(base) === 3 ? Array.from(base) : base, key);
    if (typeof base !== "object") {
      throw new Error(`Cannot resolve patch at '${path.join("/")}'.`);
    }
  }
  return base;
}
function strictCopy(target) {
  const copy = Object.create(Object.getPrototypeOf(target));
  Reflect.ownKeys(target).forEach((key) => {
    let desc = Reflect.getOwnPropertyDescriptor(target, key);
    if (desc.enumerable && desc.configurable && desc.writable) {
      copy[key] = target[key];
      return;
    }
    if (!desc.writable) {
      desc.writable = true;
      desc.configurable = true;
    }
    if (desc.get || desc.set)
      desc = {
        configurable: true,
        writable: true,
        enumerable: desc.enumerable,
        value: target[key]
      };
    Reflect.defineProperty(copy, key, desc);
  });
  return copy;
}
var propIsEnum = Object.prototype.propertyIsEnumerable;
function shallowCopy(original, options) {
  let markResult;
  if (Array.isArray(original)) {
    return Array.prototype.concat.call(original);
  } else if (original instanceof Set) {
    return new Set(original.values());
  } else if (original instanceof Map) {
    return new Map(original);
  } else if ((options === null || options === void 0 ? void 0 : options.mark) && (markResult = options.mark(original, dataTypes), markResult !== void 0) && markResult !== dataTypes.mutable) {
    if (markResult === dataTypes.immutable) {
      return strictCopy(original);
    } else if (typeof markResult === "function") {
      if (options.enablePatches || options.enableAutoFreeze) {
        throw new Error(`You can't use mark and patches or auto freeze together.`);
      }
      return markResult();
    }
    throw new Error(`Unsupported mark result: ${markResult}`);
  } else if (typeof original === "object" && Object.getPrototypeOf(original) === Object.prototype) {
    const copy = {};
    Object.keys(original).forEach((key) => {
      copy[key] = original[key];
    });
    Object.getOwnPropertySymbols(original).forEach((key) => {
      if (propIsEnum.call(original, key)) {
        copy[key] = original[key];
      }
    });
    return copy;
  } else {
    throw new Error(`Please check mark() to ensure that it is a stable marker draftable function.`);
  }
}
function ensureShallowCopy(target) {
  if (target.copy)
    return;
  target.copy = shallowCopy(target.original, target.options);
}
function deepClone(target) {
  if (!isDraftable(target))
    return getValue(target);
  if (Array.isArray(target))
    return target.map(deepClone);
  if (target instanceof Map)
    return new Map(Array.from(target.entries()).map(([k, v]) => [k, deepClone(v)]));
  if (target instanceof Set)
    return new Set(Array.from(target).map(deepClone));
  const copy = Object.create(Object.getPrototypeOf(target));
  for (const key in target)
    copy[key] = deepClone(target[key]);
  return copy;
}
function cloneIfNeeded(target) {
  return isDraft(target) ? deepClone(target) : target;
}
function markChanged(proxyDraft) {
  var _a;
  proxyDraft.assignedMap = (_a = proxyDraft.assignedMap) !== null && _a !== void 0 ? _a : /* @__PURE__ */ new Map();
  if (!proxyDraft.operated) {
    proxyDraft.operated = true;
    if (proxyDraft.parent) {
      markChanged(proxyDraft.parent);
    }
  }
}
function throwFrozenError() {
  throw new Error("Cannot modify frozen object");
}
function deepFreeze(target, subKey, updatedValues, stack, keys) {
  {
    updatedValues = updatedValues !== null && updatedValues !== void 0 ? updatedValues : /* @__PURE__ */ new WeakMap();
    stack = stack !== null && stack !== void 0 ? stack : [];
    keys = keys !== null && keys !== void 0 ? keys : [];
    const value = updatedValues.has(target) ? updatedValues.get(target) : target;
    if (stack.length > 0) {
      const index = stack.indexOf(value);
      if (value && typeof value === "object" && index !== -1) {
        if (stack[0] === value) {
          throw new Error(`Forbids circular reference`);
        }
        throw new Error(`Forbids circular reference: ~/${keys.slice(0, index).map((key, index2) => {
          if (typeof key === "symbol")
            return `[${key.toString()}]`;
          const parent = stack[index2];
          if (typeof key === "object" && (parent instanceof Map || parent instanceof Set))
            return Array.from(parent.keys()).indexOf(key);
          return key;
        }).join("/")}`);
      }
      stack.push(value);
      keys.push(subKey);
    } else {
      stack.push(value);
    }
  }
  if (Object.isFrozen(target) || isDraft(target)) {
    {
      stack.pop();
      keys.pop();
    }
    return;
  }
  const type = getType(target);
  switch (type) {
    case 2:
      for (const [key, value] of target) {
        deepFreeze(key, key, updatedValues, stack, keys);
        deepFreeze(value, key, updatedValues, stack, keys);
      }
      target.set = target.clear = target.delete = throwFrozenError;
      break;
    case 3:
      for (const value of target) {
        deepFreeze(value, value, updatedValues, stack, keys);
      }
      target.add = target.clear = target.delete = throwFrozenError;
      break;
    case 1:
      Object.freeze(target);
      let index = 0;
      for (const value of target) {
        deepFreeze(value, index, updatedValues, stack, keys);
        index += 1;
      }
      break;
    default:
      Object.freeze(target);
      Object.keys(target).forEach((name) => {
        const value = target[name];
        deepFreeze(value, name, updatedValues, stack, keys);
      });
  }
  {
    stack.pop();
    keys.pop();
  }
}
function forEach(target, iter) {
  const type = getType(target);
  if (type === 0) {
    Reflect.ownKeys(target).forEach((key) => {
      iter(key, target[key], target);
    });
  } else if (type === 1) {
    let index = 0;
    for (const entry of target) {
      iter(index, entry, target);
      index += 1;
    }
  } else {
    target.forEach((entry, index) => iter(index, entry, target));
  }
}
function handleValue(target, handledSet, options) {
  if (isDraft(target) || !isDraftable(target, options) || handledSet.has(target) || Object.isFrozen(target))
    return;
  const isSet = target instanceof Set;
  const setMap = isSet ? /* @__PURE__ */ new Map() : void 0;
  handledSet.add(target);
  forEach(target, (key, value) => {
    var _a;
    if (isDraft(value)) {
      const proxyDraft = getProxyDraft(value);
      ensureShallowCopy(proxyDraft);
      const updatedValue = ((_a = proxyDraft.assignedMap) === null || _a === void 0 ? void 0 : _a.size) || proxyDraft.operated ? proxyDraft.copy : proxyDraft.original;
      set(isSet ? setMap : target, key, updatedValue);
    } else {
      handleValue(value, handledSet, options);
    }
  });
  if (setMap) {
    const set2 = target;
    const values = Array.from(set2);
    set2.clear();
    values.forEach((value) => {
      set2.add(setMap.has(value) ? setMap.get(value) : value);
    });
  }
}
function finalizeAssigned(proxyDraft, key) {
  const copy = proxyDraft.type === 3 ? proxyDraft.setMap : proxyDraft.copy;
  if (proxyDraft.finalities.revoke.length > 1 && proxyDraft.assignedMap.get(key) && copy) {
    handleValue(get(copy, key), proxyDraft.finalities.handledSet, proxyDraft.options);
  }
}
function finalizeSetValue(target) {
  if (target.type === 3 && target.copy) {
    target.copy.clear();
    target.setMap.forEach((value) => {
      target.copy.add(getValue(value));
    });
  }
}
function finalizePatches(target, generatePatches2, patches, inversePatches) {
  const shouldFinalize = target.operated && target.assignedMap && target.assignedMap.size > 0 && !target.finalized;
  if (shouldFinalize) {
    if (patches && inversePatches) {
      const basePath = getPath(target);
      if (basePath) {
        generatePatches2(target, basePath, patches, inversePatches);
      }
    }
    target.finalized = true;
  }
}
function markFinalization(target, key, value, generatePatches2) {
  const proxyDraft = getProxyDraft(value);
  if (proxyDraft) {
    if (!proxyDraft.callbacks) {
      proxyDraft.callbacks = [];
    }
    proxyDraft.callbacks.push((patches, inversePatches) => {
      var _a;
      const copy = target.type === 3 ? target.setMap : target.copy;
      if (isEqual(get(copy, key), value)) {
        let updatedValue = proxyDraft.original;
        if (proxyDraft.copy) {
          updatedValue = proxyDraft.copy;
        }
        finalizeSetValue(target);
        finalizePatches(target, generatePatches2, patches, inversePatches);
        if (target.options.enableAutoFreeze) {
          target.options.updatedValues = (_a = target.options.updatedValues) !== null && _a !== void 0 ? _a : /* @__PURE__ */ new WeakMap();
          target.options.updatedValues.set(updatedValue, proxyDraft.original);
        }
        set(copy, key, updatedValue);
      }
    });
    if (target.options.enableAutoFreeze) {
      if (proxyDraft.finalities !== target.finalities) {
        target.options.enableAutoFreeze = false;
      }
    }
  }
  if (isDraftable(value, target.options)) {
    target.finalities.draft.push(() => {
      const copy = target.type === 3 ? target.setMap : target.copy;
      if (isEqual(get(copy, key), value)) {
        finalizeAssigned(target, key);
      }
    });
  }
}
function generateArrayPatches(proxyState, basePath, patches, inversePatches, pathAsArray) {
  let { original, assignedMap, options } = proxyState;
  let copy = proxyState.copy;
  if (copy.length < original.length) {
    [original, copy] = [copy, original];
    [patches, inversePatches] = [inversePatches, patches];
  }
  for (let index = 0; index < original.length; index += 1) {
    if (assignedMap.get(index.toString()) && copy[index] !== original[index]) {
      const _path = basePath.concat([index]);
      const path = escapePath(_path, pathAsArray);
      patches.push({
        op: Operation.Replace,
        path,
        // If it is a draft, it needs to be deep cloned, and it may also be non-draft.
        value: cloneIfNeeded(copy[index])
      });
      inversePatches.push({
        op: Operation.Replace,
        path,
        // If it is a draft, it needs to be deep cloned, and it may also be non-draft.
        value: cloneIfNeeded(original[index])
      });
    }
  }
  for (let index = original.length; index < copy.length; index += 1) {
    const _path = basePath.concat([index]);
    const path = escapePath(_path, pathAsArray);
    patches.push({
      op: Operation.Add,
      path,
      // If it is a draft, it needs to be deep cloned, and it may also be non-draft.
      value: cloneIfNeeded(copy[index])
    });
  }
  if (original.length < copy.length) {
    const { arrayLengthAssignment = true } = options.enablePatches;
    if (arrayLengthAssignment) {
      const _path = basePath.concat(["length"]);
      const path = escapePath(_path, pathAsArray);
      inversePatches.push({
        op: Operation.Replace,
        path,
        value: original.length
      });
    } else {
      for (let index = copy.length; original.length < index; index -= 1) {
        const _path = basePath.concat([index - 1]);
        const path = escapePath(_path, pathAsArray);
        inversePatches.push({
          op: Operation.Remove,
          path
        });
      }
    }
  }
}
function generatePatchesFromAssigned({ original, copy, assignedMap }, basePath, patches, inversePatches, pathAsArray) {
  assignedMap.forEach((assignedValue, key) => {
    const originalValue = get(original, key);
    const value = cloneIfNeeded(get(copy, key));
    const op = !assignedValue ? Operation.Remove : has(original, key) ? Operation.Replace : Operation.Add;
    if (isEqual(originalValue, value) && op === Operation.Replace)
      return;
    const _path = basePath.concat(key);
    const path = escapePath(_path, pathAsArray);
    patches.push(op === Operation.Remove ? { op, path } : { op, path, value });
    inversePatches.push(op === Operation.Add ? { op: Operation.Remove, path } : op === Operation.Remove ? { op: Operation.Add, path, value: originalValue } : { op: Operation.Replace, path, value: originalValue });
  });
}
function generateSetPatches({ original, copy }, basePath, patches, inversePatches, pathAsArray) {
  let index = 0;
  original.forEach((value) => {
    if (!copy.has(value)) {
      const _path = basePath.concat([index]);
      const path = escapePath(_path, pathAsArray);
      patches.push({
        op: Operation.Remove,
        path,
        value
      });
      inversePatches.unshift({
        op: Operation.Add,
        path,
        value
      });
    }
    index += 1;
  });
  index = 0;
  copy.forEach((value) => {
    if (!original.has(value)) {
      const _path = basePath.concat([index]);
      const path = escapePath(_path, pathAsArray);
      patches.push({
        op: Operation.Add,
        path,
        value
      });
      inversePatches.unshift({
        op: Operation.Remove,
        path,
        value
      });
    }
    index += 1;
  });
}
function generatePatches(proxyState, basePath, patches, inversePatches) {
  const { pathAsArray = true } = proxyState.options.enablePatches;
  switch (proxyState.type) {
    case 0:
    case 2:
      return generatePatchesFromAssigned(proxyState, basePath, patches, inversePatches, pathAsArray);
    case 1:
      return generateArrayPatches(proxyState, basePath, patches, inversePatches, pathAsArray);
    case 3:
      return generateSetPatches(proxyState, basePath, patches, inversePatches, pathAsArray);
  }
}
var readable = false;
var checkReadable = (value, options, ignoreCheckDraftable = false) => {
  if (typeof value === "object" && value !== null && (!isDraftable(value, options) || ignoreCheckDraftable) && !readable) {
    throw new Error(`Strict mode: Mutable data cannot be accessed directly, please use 'unsafe(callback)' wrap.`);
  }
};
var mapHandler = {
  get size() {
    const current2 = latest(getProxyDraft(this));
    return current2.size;
  },
  has(key) {
    return latest(getProxyDraft(this)).has(key);
  },
  set(key, value) {
    const target = getProxyDraft(this);
    const source = latest(target);
    if (!source.has(key) || !isEqual(source.get(key), value)) {
      ensureShallowCopy(target);
      markChanged(target);
      target.assignedMap.set(key, true);
      target.copy.set(key, value);
      markFinalization(target, key, value, generatePatches);
    }
    return this;
  },
  delete(key) {
    if (!this.has(key)) {
      return false;
    }
    const target = getProxyDraft(this);
    ensureShallowCopy(target);
    markChanged(target);
    if (target.original.has(key)) {
      target.assignedMap.set(key, false);
    } else {
      target.assignedMap.delete(key);
    }
    target.copy.delete(key);
    return true;
  },
  clear() {
    const target = getProxyDraft(this);
    if (!this.size)
      return;
    ensureShallowCopy(target);
    markChanged(target);
    target.assignedMap = /* @__PURE__ */ new Map();
    for (const [key] of target.original) {
      target.assignedMap.set(key, false);
    }
    target.copy.clear();
  },
  forEach(callback, thisArg) {
    const target = getProxyDraft(this);
    latest(target).forEach((_value, _key) => {
      callback.call(thisArg, this.get(_key), _key, this);
    });
  },
  get(key) {
    var _a, _b;
    const target = getProxyDraft(this);
    const value = latest(target).get(key);
    const mutable = ((_b = (_a = target.options).mark) === null || _b === void 0 ? void 0 : _b.call(_a, value, dataTypes)) === dataTypes.mutable;
    if (target.options.strict) {
      checkReadable(value, target.options, mutable);
    }
    if (mutable) {
      return value;
    }
    if (target.finalized || !isDraftable(value, target.options)) {
      return value;
    }
    if (value !== target.original.get(key)) {
      return value;
    }
    const draft = internal.createDraft({
      original: value,
      parentDraft: target,
      key,
      finalities: target.finalities,
      options: target.options
    });
    ensureShallowCopy(target);
    target.copy.set(key, draft);
    return draft;
  },
  keys() {
    return latest(getProxyDraft(this)).keys();
  },
  values() {
    const iterator = this.keys();
    return {
      [iteratorSymbol]: () => this.values(),
      next: () => {
        const result = iterator.next();
        if (result.done)
          return result;
        const value = this.get(result.value);
        return {
          done: false,
          value
        };
      }
    };
  },
  entries() {
    const iterator = this.keys();
    return {
      [iteratorSymbol]: () => this.entries(),
      next: () => {
        const result = iterator.next();
        if (result.done)
          return result;
        const value = this.get(result.value);
        return {
          done: false,
          value: [result.value, value]
        };
      }
    };
  },
  [iteratorSymbol]() {
    return this.entries();
  }
};
var mapHandlerKeys = Reflect.ownKeys(mapHandler);
var getNextIterator = (target, iterator, { isValuesIterator }) => () => {
  var _a, _b;
  const result = iterator.next();
  if (result.done)
    return result;
  const key = result.value;
  let value = target.setMap.get(key);
  const currentDraft = getProxyDraft(value);
  const mutable = ((_b = (_a = target.options).mark) === null || _b === void 0 ? void 0 : _b.call(_a, value, dataTypes)) === dataTypes.mutable;
  if (target.options.strict) {
    checkReadable(key, target.options, mutable);
  }
  if (!mutable && !currentDraft && isDraftable(key, target.options) && !target.finalized && target.original.has(key)) {
    const proxy = internal.createDraft({
      original: key,
      parentDraft: target,
      key,
      finalities: target.finalities,
      options: target.options
    });
    target.setMap.set(key, proxy);
    value = proxy;
  } else if (currentDraft) {
    value = currentDraft.proxy;
  }
  return {
    done: false,
    value: isValuesIterator ? value : [value, value]
  };
};
var setHandler = {
  get size() {
    const target = getProxyDraft(this);
    return target.setMap.size;
  },
  has(value) {
    const target = getProxyDraft(this);
    if (target.setMap.has(value))
      return true;
    ensureShallowCopy(target);
    const valueProxyDraft = getProxyDraft(value);
    if (valueProxyDraft && target.setMap.has(valueProxyDraft.original))
      return true;
    return false;
  },
  add(value) {
    const target = getProxyDraft(this);
    if (!this.has(value)) {
      ensureShallowCopy(target);
      markChanged(target);
      target.assignedMap.set(value, true);
      target.setMap.set(value, value);
      markFinalization(target, value, value, generatePatches);
    }
    return this;
  },
  delete(value) {
    if (!this.has(value)) {
      return false;
    }
    const target = getProxyDraft(this);
    ensureShallowCopy(target);
    markChanged(target);
    const valueProxyDraft = getProxyDraft(value);
    if (valueProxyDraft && target.setMap.has(valueProxyDraft.original)) {
      target.assignedMap.set(valueProxyDraft.original, false);
      return target.setMap.delete(valueProxyDraft.original);
    }
    if (!valueProxyDraft && target.setMap.has(value)) {
      target.assignedMap.set(value, false);
    } else {
      target.assignedMap.delete(value);
    }
    return target.setMap.delete(value);
  },
  clear() {
    if (!this.size)
      return;
    const target = getProxyDraft(this);
    ensureShallowCopy(target);
    markChanged(target);
    for (const value of target.original) {
      target.assignedMap.set(value, false);
    }
    target.setMap.clear();
  },
  values() {
    const target = getProxyDraft(this);
    ensureShallowCopy(target);
    const iterator = target.setMap.keys();
    return {
      [Symbol.iterator]: () => this.values(),
      next: getNextIterator(target, iterator, { isValuesIterator: true })
    };
  },
  entries() {
    const target = getProxyDraft(this);
    ensureShallowCopy(target);
    const iterator = target.setMap.keys();
    return {
      [Symbol.iterator]: () => this.entries(),
      next: getNextIterator(target, iterator, {
        isValuesIterator: false
      })
    };
  },
  keys() {
    return this.values();
  },
  [iteratorSymbol]() {
    return this.values();
  },
  forEach(callback, thisArg) {
    const iterator = this.values();
    let result = iterator.next();
    while (!result.done) {
      callback.call(thisArg, result.value, result.value, this);
      result = iterator.next();
    }
  }
};
var setHandlerKeys = Reflect.ownKeys(setHandler);
var draftsCache = /* @__PURE__ */ new WeakSet();
var proxyHandler = {
  get(target, key, receiver) {
    var _a, _b;
    const copy = (_a = target.copy) === null || _a === void 0 ? void 0 : _a[key];
    if (copy && draftsCache.has(copy)) {
      return copy;
    }
    if (key === PROXY_DRAFT)
      return target;
    let markResult;
    if (target.options.mark) {
      const value2 = key === "size" && (target.original instanceof Map || target.original instanceof Set) ? Reflect.get(target.original, key) : Reflect.get(target.original, key, receiver);
      markResult = target.options.mark(value2, dataTypes);
      if (markResult === dataTypes.mutable) {
        if (target.options.strict) {
          checkReadable(value2, target.options, true);
        }
        return value2;
      }
    }
    const source = latest(target);
    if (source instanceof Map && mapHandlerKeys.includes(key)) {
      if (key === "size") {
        return Object.getOwnPropertyDescriptor(mapHandler, "size").get.call(target.proxy);
      }
      const handle = mapHandler[key];
      if (handle) {
        return handle.bind(target.proxy);
      }
    }
    if (source instanceof Set && setHandlerKeys.includes(key)) {
      if (key === "size") {
        return Object.getOwnPropertyDescriptor(setHandler, "size").get.call(target.proxy);
      }
      const handle = setHandler[key];
      if (handle) {
        return handle.bind(target.proxy);
      }
    }
    if (!has(source, key)) {
      const desc = getDescriptor(source, key);
      return desc ? `value` in desc ? desc.value : (
        // !case: support for getter
        (_b = desc.get) === null || _b === void 0 ? void 0 : _b.call(target.proxy)
      ) : void 0;
    }
    const value = source[key];
    if (target.options.strict) {
      checkReadable(value, target.options);
    }
    if (target.finalized || !isDraftable(value, target.options)) {
      return value;
    }
    if (value === peek(target.original, key)) {
      ensureShallowCopy(target);
      target.copy[key] = createDraft({
        original: target.original[key],
        parentDraft: target,
        key: target.type === 1 ? Number(key) : key,
        finalities: target.finalities,
        options: target.options
      });
      if (typeof markResult === "function") {
        const subProxyDraft = getProxyDraft(target.copy[key]);
        ensureShallowCopy(subProxyDraft);
        markChanged(subProxyDraft);
        return subProxyDraft.copy;
      }
      return target.copy[key];
    }
    return value;
  },
  set(target, key, value) {
    var _a;
    if (target.type === 3 || target.type === 2) {
      throw new Error(`Map/Set draft does not support any property assignment.`);
    }
    let _key;
    if (target.type === 1 && key !== "length" && !(Number.isInteger(_key = Number(key)) && _key >= 0 && (key === 0 || _key === 0 || String(_key) === String(key)))) {
      throw new Error(`Only supports setting array indices and the 'length' property.`);
    }
    const desc = getDescriptor(latest(target), key);
    if (desc === null || desc === void 0 ? void 0 : desc.set) {
      desc.set.call(target.proxy, value);
      return true;
    }
    const current2 = peek(latest(target), key);
    const currentProxyDraft = getProxyDraft(current2);
    if (currentProxyDraft && isEqual(currentProxyDraft.original, value)) {
      target.copy[key] = value;
      target.assignedMap = (_a = target.assignedMap) !== null && _a !== void 0 ? _a : /* @__PURE__ */ new Map();
      target.assignedMap.set(key, false);
      return true;
    }
    if (isEqual(value, current2) && (value !== void 0 || has(target.original, key)))
      return true;
    ensureShallowCopy(target);
    markChanged(target);
    if (has(target.original, key) && isEqual(value, target.original[key])) {
      target.assignedMap.delete(key);
    } else {
      target.assignedMap.set(key, true);
    }
    target.copy[key] = value;
    markFinalization(target, key, value, generatePatches);
    return true;
  },
  has(target, key) {
    return key in latest(target);
  },
  ownKeys(target) {
    return Reflect.ownKeys(latest(target));
  },
  getOwnPropertyDescriptor(target, key) {
    const source = latest(target);
    const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
    if (!descriptor)
      return descriptor;
    return {
      writable: true,
      configurable: target.type !== 1 || key !== "length",
      enumerable: descriptor.enumerable,
      value: source[key]
    };
  },
  getPrototypeOf(target) {
    return Reflect.getPrototypeOf(target.original);
  },
  setPrototypeOf() {
    throw new Error(`Cannot call 'setPrototypeOf()' on drafts`);
  },
  defineProperty() {
    throw new Error(`Cannot call 'defineProperty()' on drafts`);
  },
  deleteProperty(target, key) {
    var _a;
    if (target.type === 1) {
      return proxyHandler.set.call(this, target, key, void 0, target.proxy);
    }
    if (peek(target.original, key) !== void 0 || key in target.original) {
      ensureShallowCopy(target);
      markChanged(target);
      target.assignedMap.set(key, false);
    } else {
      target.assignedMap = (_a = target.assignedMap) !== null && _a !== void 0 ? _a : /* @__PURE__ */ new Map();
      target.assignedMap.delete(key);
    }
    if (target.copy)
      delete target.copy[key];
    return true;
  }
};
function createDraft(createDraftOptions) {
  const { original, parentDraft, key, finalities, options } = createDraftOptions;
  const type = getType(original);
  const proxyDraft = {
    type,
    finalized: false,
    parent: parentDraft,
    original,
    copy: null,
    proxy: null,
    finalities,
    options,
    // Mapping of draft Set items to their corresponding draft values.
    setMap: type === 3 ? new Map(original.entries()) : void 0
  };
  if (key || "key" in createDraftOptions) {
    proxyDraft.key = key;
  }
  const { proxy, revoke } = Proxy.revocable(type === 1 ? Object.assign([], proxyDraft) : proxyDraft, proxyHandler);
  finalities.revoke.push(revoke);
  draftsCache.add(proxy);
  proxyDraft.proxy = proxy;
  if (parentDraft) {
    const target = parentDraft;
    target.finalities.draft.push((patches, inversePatches) => {
      var _a, _b;
      const oldProxyDraft = getProxyDraft(proxy);
      let copy = target.type === 3 ? target.setMap : target.copy;
      const draft = get(copy, key);
      const proxyDraft2 = getProxyDraft(draft);
      if (proxyDraft2) {
        let updatedValue = proxyDraft2.original;
        if (proxyDraft2.operated) {
          updatedValue = getValue(draft);
        }
        finalizeSetValue(proxyDraft2);
        finalizePatches(proxyDraft2, generatePatches, patches, inversePatches);
        if (target.options.enableAutoFreeze) {
          target.options.updatedValues = (_a = target.options.updatedValues) !== null && _a !== void 0 ? _a : /* @__PURE__ */ new WeakMap();
          target.options.updatedValues.set(updatedValue, proxyDraft2.original);
        }
        set(copy, key, updatedValue);
      }
      (_b = oldProxyDraft.callbacks) === null || _b === void 0 ? void 0 : _b.forEach((callback) => {
        callback(patches, inversePatches);
      });
    });
  } else {
    const target = getProxyDraft(proxy);
    target.finalities.draft.push((patches, inversePatches) => {
      finalizeSetValue(target);
      finalizePatches(target, generatePatches, patches, inversePatches);
    });
  }
  return proxy;
}
internal.createDraft = createDraft;
function finalizeDraft(result, returnedValue, patches, inversePatches, enableAutoFreeze) {
  var _a;
  const proxyDraft = getProxyDraft(result);
  const original = (_a = proxyDraft === null || proxyDraft === void 0 ? void 0 : proxyDraft.original) !== null && _a !== void 0 ? _a : result;
  const hasReturnedValue = !!returnedValue.length;
  if (proxyDraft === null || proxyDraft === void 0 ? void 0 : proxyDraft.operated) {
    while (proxyDraft.finalities.draft.length > 0) {
      const finalize = proxyDraft.finalities.draft.pop();
      finalize(patches, inversePatches);
    }
  }
  const state = hasReturnedValue ? returnedValue[0] : proxyDraft ? proxyDraft.operated ? proxyDraft.copy : proxyDraft.original : result;
  if (proxyDraft)
    revokeProxy(proxyDraft);
  if (enableAutoFreeze) {
    deepFreeze(state, state, proxyDraft === null || proxyDraft === void 0 ? void 0 : proxyDraft.options.updatedValues);
  }
  return [
    state,
    patches && hasReturnedValue ? [{ op: Operation.Replace, path: [], value: returnedValue[0] }] : patches,
    inversePatches && hasReturnedValue ? [{ op: Operation.Replace, path: [], value: original }] : inversePatches
  ];
}
function draftify(baseState, options) {
  var _a;
  const finalities = {
    draft: [],
    revoke: [],
    handledSet: /* @__PURE__ */ new WeakSet()
  };
  let patches;
  let inversePatches;
  if (options.enablePatches) {
    patches = [];
    inversePatches = [];
  }
  const isMutable = ((_a = options.mark) === null || _a === void 0 ? void 0 : _a.call(options, baseState, dataTypes)) === dataTypes.mutable || !isDraftable(baseState, options);
  const draft = isMutable ? baseState : createDraft({
    original: baseState,
    parentDraft: null,
    finalities,
    options
  });
  return [
    draft,
    (returnedValue = []) => {
      const [finalizedState, finalizedPatches, finalizedInversePatches] = finalizeDraft(draft, returnedValue, patches, inversePatches, options.enableAutoFreeze);
      return options.enablePatches ? [finalizedState, finalizedPatches, finalizedInversePatches] : finalizedState;
    }
  ];
}
function handleReturnValue(options) {
  const { rootDraft, value, useRawReturn = false, isRoot = true } = options;
  forEach(value, (key, item, source) => {
    const proxyDraft = getProxyDraft(item);
    if (proxyDraft && rootDraft && proxyDraft.finalities === rootDraft.finalities) {
      options.isContainDraft = true;
      const currentValue = proxyDraft.original;
      if (source instanceof Set) {
        const arr = Array.from(source);
        source.clear();
        arr.forEach((_item) => source.add(key === _item ? currentValue : _item));
      } else {
        set(source, key, currentValue);
      }
    } else if (typeof item === "object" && item !== null) {
      options.value = item;
      options.isRoot = false;
      handleReturnValue(options);
    }
  });
  if (isRoot) {
    if (!options.isContainDraft)
      console.warn(`The return value does not contain any draft, please use 'rawReturn()' to wrap the return value to improve performance.`);
    if (useRawReturn) {
      console.warn(`The return value contains drafts, please don't use 'rawReturn()' to wrap the return value.`);
    }
  }
}
function getCurrent(target) {
  const proxyDraft = getProxyDraft(target);
  if (!isDraftable(target, proxyDraft === null || proxyDraft === void 0 ? void 0 : proxyDraft.options))
    return target;
  const type = getType(target);
  if (proxyDraft && !proxyDraft.operated)
    return proxyDraft.original;
  let currentValue;
  function ensureShallowCopy2() {
    currentValue = type === 2 ? new Map(target) : type === 3 ? Array.from(proxyDraft.setMap.values()) : shallowCopy(target, proxyDraft === null || proxyDraft === void 0 ? void 0 : proxyDraft.options);
  }
  if (proxyDraft) {
    proxyDraft.finalized = true;
    try {
      ensureShallowCopy2();
    } finally {
      proxyDraft.finalized = false;
    }
  } else {
    currentValue = target;
  }
  forEach(currentValue, (key, value) => {
    if (proxyDraft && isEqual(get(proxyDraft.original, key), value))
      return;
    const newValue = getCurrent(value);
    if (newValue !== value) {
      if (currentValue === target)
        ensureShallowCopy2();
      set(currentValue, key, newValue);
    }
  });
  return type === 3 ? new Set(currentValue) : currentValue;
}
function current(target) {
  if (!isDraft(target)) {
    throw new Error(`current() is only used for Draft, parameter: ${target}`);
  }
  return getCurrent(target);
}
var makeCreator = (arg) => {
  if (arg !== void 0 && Object.prototype.toString.call(arg) !== "[object Object]") {
    throw new Error(`Invalid options: ${String(arg)}, 'options' should be an object.`);
  }
  return function create2(arg0, arg1, arg2) {
    var _a, _b, _c;
    if (typeof arg0 === "function" && typeof arg1 !== "function") {
      return function(base2, ...args) {
        return create2(base2, (draft2) => arg0.call(this, draft2, ...args), arg1);
      };
    }
    const base = arg0;
    const mutate = arg1;
    let options = arg2;
    if (typeof arg1 !== "function") {
      options = arg1;
    }
    if (options !== void 0 && Object.prototype.toString.call(options) !== "[object Object]") {
      throw new Error(`Invalid options: ${options}, 'options' should be an object.`);
    }
    options = Object.assign(Object.assign({}, arg), options);
    const state = isDraft(base) ? current(base) : base;
    const mark = Array.isArray(options.mark) ? (value, types) => {
      for (const mark2 of options.mark) {
        if (typeof mark2 !== "function") {
          throw new Error(`Invalid mark: ${mark2}, 'mark' should be a function.`);
        }
        const result2 = mark2(value, types);
        if (result2) {
          return result2;
        }
      }
      return;
    } : options.mark;
    const enablePatches = (_a = options.enablePatches) !== null && _a !== void 0 ? _a : false;
    const strict = (_b = options.strict) !== null && _b !== void 0 ? _b : false;
    const enableAutoFreeze = (_c = options.enableAutoFreeze) !== null && _c !== void 0 ? _c : false;
    const _options = {
      enableAutoFreeze,
      mark,
      strict,
      enablePatches
    };
    if (!isDraftable(state, _options) && typeof state === "object" && state !== null) {
      throw new Error(`Invalid base state: create() only supports plain objects, arrays, Set, Map or using mark() to mark the state as immutable.`);
    }
    const [draft, finalize] = draftify(state, _options);
    if (typeof arg1 !== "function") {
      if (!isDraftable(state, _options)) {
        throw new Error(`Invalid base state: create() only supports plain objects, arrays, Set, Map or using mark() to mark the state as immutable.`);
      }
      return [draft, finalize];
    }
    let result;
    try {
      result = mutate(draft);
    } catch (error) {
      revokeProxy(getProxyDraft(draft));
      throw error;
    }
    const returnValue = (value) => {
      const proxyDraft = getProxyDraft(draft);
      if (!isDraft(value)) {
        if (value !== void 0 && !isEqual(value, draft) && (proxyDraft === null || proxyDraft === void 0 ? void 0 : proxyDraft.operated)) {
          throw new Error(`Either the value is returned as a new non-draft value, or only the draft is modified without returning any value.`);
        }
        const rawReturnValue = value === null || value === void 0 ? void 0 : value[RAW_RETURN_SYMBOL];
        if (rawReturnValue) {
          const _value = rawReturnValue[0];
          if (_options.strict && typeof value === "object" && value !== null) {
            handleReturnValue({
              rootDraft: proxyDraft,
              value,
              useRawReturn: true
            });
          }
          return finalize([_value]);
        }
        if (value !== void 0) {
          if (typeof value === "object" && value !== null) {
            handleReturnValue({ rootDraft: proxyDraft, value });
          }
          return finalize([value]);
        }
      }
      if (value === draft || value === void 0) {
        return finalize([]);
      }
      const returnedProxyDraft = getProxyDraft(value);
      if (_options === returnedProxyDraft.options) {
        if (returnedProxyDraft.operated) {
          throw new Error(`Cannot return a modified child draft.`);
        }
        return finalize([current(value)]);
      }
      return finalize([value]);
    };
    if (result instanceof Promise) {
      return result.then(returnValue, (error) => {
        revokeProxy(getProxyDraft(draft));
        throw error;
      });
    }
    return returnValue(result);
  };
};
var create = makeCreator();
var constructorString = Object.prototype.constructor.toString();

// ../../../root/.cache/deno/deno_esbuild/registry.npmjs.org/safe-stable-stringify@2.4.3/node_modules/safe-stable-stringify/esm/wrapper.js
var import__ = __toESM(require_safe_stable_stringify());
var configure = import__.default.configure;
var wrapper_default = import__.default;

// src/shared/util.ts
var import_es6 = __toESM(require_es6());
var resolvePreferredWorker = (workerA, workerB) => {
  return workerA.localeCompare(workerB) < 0 ? workerA : workerB;
};
var shaDockerJob = (job) => {
  const jobReadyForSha = create(job, (draft) => {
    const configFiles = draft.configFiles;
    if (configFiles) {
      Object.keys(configFiles).forEach((key) => {
        if (configFiles[key].type === "url") {
          configFiles[key].value = reduceUrlToHashVersion(
            configFiles[key]?.value
          );
        }
      });
    }
    const inputs = draft.inputs;
    if (inputs) {
      Object.keys(inputs).forEach((key) => {
        if (inputs[key].type === "url") {
          inputs[key].value = reduceUrlToHashVersion(
            inputs[key]?.value
          );
        }
      });
    }
  });
  return shaObject(jobReadyForSha);
};
var reduceUrlToHashVersion = (url) => {
  if (url.includes("/presignedurl/")) {
    const tokens = url.split("/presignedurl/");
    return tokens[0];
  }
  if (url.startsWith("https://metaframe-asman-test.s3.us-west-1.amazonaws.com")) {
    const urlBlob = new URL(url);
    urlBlob.search = "";
    urlBlob.hash = "";
    return urlBlob.href;
  }
  return url;
};
var shaObject = (obj) => {
  const orderedStringFromObject = wrapper_default(obj);
  const msgBuffer = new TextEncoder().encode(orderedStringFromObject);
  return sha256Buffer(msgBuffer);
};
var sha256Buffer = async (buffer) => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return hashHex;
};
var fetchRobust = (0, import_fetch_retry.default)(fetch, {
  retries: 8,
  // eslint-disable-next-line
  retryDelay: (attempt, _error, _response) => {
    return Math.pow(2, attempt) * 400;
  },
  retryOn: (attempt, error, response) => {
    if (error !== null || response && response.status >= 400) {
      if (attempt > 7) {
        if (error) {
          console.error(error);
        }
        console.log(
          `Retried too many times: response.status=${response?.status} response.statusText=${response?.statusText} attempt number ${attempt + 1} url=${response?.url}`
        );
        return false;
      }
      return true;
    }
    return false;
  }
});
var resolveMostCorrectJob = (jobA, jobB) => {
  if ((0, import_es6.default)(jobA, jobB)) {
    return jobA;
  }
  if (jobA && !jobB) {
    return jobA;
  }
  if (!jobA && jobB) {
    return jobB;
  }
  const jobALastChange = jobA.history[jobA.history.length - 1];
  const isJobAFinished = jobALastChange.state === "Finished" /* Finished */;
  const jobBLastChange = jobB.history[jobB.history.length - 1];
  const isJobBFinished = jobBLastChange.state === "Finished" /* Finished */;
  if (isJobAFinished && isJobBFinished) {
    return jobALastChange.value.time < jobBLastChange.value.time ? jobA : jobB;
  }
  if (isJobAFinished) {
    return jobA;
  }
  if (isJobBFinished) {
    return jobB;
  }
  if (jobA.history.length < jobB.history.length) {
    return jobB;
  } else if (jobA.history.length > jobB.history.length) {
    return jobA;
  }
  const jobALastEvent = jobA.history[jobA.history.length - 1];
  const jobBLastEvent = jobB.history[jobB.history.length - 1];
  if (jobALastEvent.state === jobBLastEvent.state) {
    switch (jobALastEvent.state) {
      case "Running" /* Running */: {
        const workerA = jobALastEvent.value.worker;
        const workerB = jobBLastEvent.value.worker;
        return resolvePreferredWorker(workerA, workerB) === workerA ? jobA : jobB;
      }
      case "Queued" /* Queued */:
      case "ReQueued" /* ReQueued */:
      case "Finished" /* Finished */:
      default:
        return jobALastEvent.value.time < jobBLastEvent.value.time ? jobA : jobB;
    }
  } else {
    console.log(
      `\u{1F1E8}\u{1F1ED}\u{1F1E8}\u{1F1ED}\u{1F1E8}\u{1F1ED} \u{1F318} resolving but jobA=${jobA.state} jobB=${jobB.state}`
    );
    if (jobA.state === "Running" /* Running */) {
      return jobA;
    } else if (jobB.state === "Running" /* Running */) {
      return jobB;
    }
    return jobA.history[0].value.time < jobB.history[0].value.time ? jobA : jobB;
  }
};

// src/shared/base64.ts
function decodeBase64(b64) {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}
var encoder = new TextEncoder();

// src/shared/dataref.ts
var ENV_VAR_DATA_ITEM_LENGTH_MAX = 200;
var dataRefToDownloadLink = async (ref) => {
  const buffer = await dataRefToBuffer(ref);
  return URL.createObjectURL(
    new Blob([buffer], { type: "application/octet-stream" })
  );
};
var dataRefToBuffer = async (ref) => {
  switch (ref.type) {
    case "base64" /* base64 */:
      return decodeBase64(ref.value);
    case "utf8" /* utf8 */:
      return new TextEncoder().encode(ref.value);
    case "json" /* json */:
      return new TextEncoder().encode(JSON.stringify(ref.value));
    case "url" /* url */: {
      const arrayBufferFromUrl = await urlToUint8Array(ref.value);
      return arrayBufferFromUrl;
    }
    case "key" /* key */: {
      const arrayBufferFromKey = await fetchBlobFromHash(
        ref.value,
        "https://container.mtfm.io"
      );
      return new Uint8Array(arrayBufferFromKey);
    }
    default:
      throw `Not yet implemented: DataRef.type "${ref.type}" unknown`;
  }
};
var AlreadyUploaded = {};
var copyLargeBlobsToCloud = async (inputs, address) => {
  if (!inputs || Object.keys(inputs).length === 0) {
    return;
  }
  const result = {};
  await Promise.all(
    Object.keys(inputs).map(async (name) => {
      const type = inputs[name]?.type || DataRefTypeDefault;
      let uint8ArrayIfBig;
      switch (type) {
        case "key" /* key */:
          break;
        case "url" /* url */:
          break;
        case "json" /* json */:
          if (inputs?.[name]?.value) {
            const jsonString = JSON.stringify(inputs[name].value);
            if (jsonString.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
              uint8ArrayIfBig = utf8ToBuffer(jsonString);
            }
          }
          break;
        case "base64" /* base64 */:
          if (inputs?.[name]?.value.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
            uint8ArrayIfBig = decodeBase64(inputs[name].value);
          }
          break;
        case "utf8" /* utf8 */:
          if (inputs?.[name]?.value?.length > ENV_VAR_DATA_ITEM_LENGTH_MAX) {
            uint8ArrayIfBig = utf8ToBuffer(inputs[name].value);
          }
          break;
        default:
      }
      if (uint8ArrayIfBig) {
        const hash = await sha256Buffer(uint8ArrayIfBig);
        if (!AlreadyUploaded[hash]) {
          const urlGetUpload = `${address}/upload/${hash}`;
          const resp = await fetchRobust(urlGetUpload, { redirect: "follow" });
          if (!resp.ok) {
            throw new Error(
              `Failed to get upload URL from ${urlGetUpload} status=${resp.status}`
            );
          }
          const json = await resp.json();
          const responseUpload = await fetchRobust(json.url, {
            // @ts-ignore: TS2353
            method: "PUT",
            // @ts-ignore: TS2353
            redirect: "follow",
            body: uint8ArrayIfBig,
            headers: { "Content-Type": "application/octet-stream" }
          });
          await responseUpload.text();
          result[name] = json.ref;
          AlreadyUploaded[hash] = true;
        } else {
          result[name] = {
            value: hash,
            type: "key" /* key */
          };
        }
      } else {
        result[name] = inputs[name];
      }
    })
  );
  return result;
};
var convertJobOutputDataRefsToExpectedFormat = async (outputs, address) => {
  if (!outputs) {
    return;
  }
  let arrayBuffer;
  const newOutputs = {};
  await Promise.all(
    Object.keys(outputs).map(async (name) => {
      const type = outputs[name].type || DataRefTypeDefault;
      switch (type) {
        case "base64" /* base64 */: {
          const internalBlobRefFromBase64 = {
            _s: true,
            _c: "Blob",
            value: outputs[name].value,
            size: 0,
            fileType: void 0
            // TODO: can we figure this out?
          };
          newOutputs[name] = internalBlobRefFromBase64;
          break;
        }
        case "key" /* key */: {
          arrayBuffer = await fetchBlobFromHash(outputs[name].value, address);
          const internalBlobRefFromHash = {
            _c: Blob.name,
            _s: true,
            value: bufferToBase64(arrayBuffer),
            size: arrayBuffer.byteLength,
            fileType: void 0
            // TODO: can we figure this out?
          };
          newOutputs[name] = internalBlobRefFromHash;
          break;
        }
        case "json" /* json */:
          newOutputs[name] = outputs[name].value;
          break;
        case "url" /* url */: {
          arrayBuffer = await fetchBlobFromUrl(outputs[name].value);
          const internalBlobRefFromUrl = {
            _s: true,
            _c: Blob.name,
            value: bufferToBase64(arrayBuffer),
            fileType: void 0,
            // TODO: can we figure this out?
            size: arrayBuffer.byteLength
          };
          newOutputs[name] = internalBlobRefFromUrl;
          break;
        }
        case "utf8" /* utf8 */:
          newOutputs[name] = outputs[name].value;
          break;
      }
    })
  );
  return newOutputs;
};
var fetchBlobFromUrl = async (url) => {
  const response = await fetchRobust(url, {
    // @ts-ignore: TS2353
    method: "GET",
    // @ts-ignore: TS2353
    redirect: "follow",
    headers: { "Content-Type": "application/octet-stream" }
  });
  const arrayBuffer = await response.arrayBuffer();
  return arrayBuffer;
};
var fetchJsonFromUrl = async (url) => {
  const response = await fetchRobust(url, {
    // @ts-ignore: TS2353
    method: "GET",
    // @ts-ignore: TS2353
    redirect: "follow",
    headers: { "Content-Type": "application/json" }
  });
  const json = await response.json();
  return json;
};
var urlToUint8Array = async (url) => {
  const response = await fetchRobust(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};
var fetchBlobFromHash = async (hash, address) => {
  const resp = await fetchRobust(`${address}/download/${hash}`, {
    // @ts-ignore: TS2353
    redirect: "follow"
  });
  const json = await resp.json();
  const arrayBuffer = await fetchBlobFromUrl(json.url);
  return arrayBuffer;
};
var _encoder = new TextEncoder();
var utf8ToBuffer = (str) => {
  return _encoder.encode(str);
};
var _decoder = new TextDecoder();
var bufferToUtf8 = (buffer) => {
  return _decoder.decode(buffer);
};
function bufferToBinaryString(buffer) {
  const base64Str = Array.prototype.map.call(buffer, function(ch) {
    return String.fromCharCode(ch);
  }).join("");
  return base64Str;
}
var bufferToBase64 = (buffer) => {
  const binstr = bufferToBinaryString(buffer);
  return btoa(binstr);
};
export {
  DataRefType,
  DataRefTypeDefault,
  DataRefTypesSet,
  DockerJobFinishedReason,
  DockerJobState,
  ENV_VAR_DATA_ITEM_LENGTH_MAX,
  WebsocketMessageTypeClientToServer,
  WebsocketMessageTypeServerBroadcast,
  WebsocketMessageTypeWorkerToServer,
  bufferToBase64,
  bufferToBinaryString,
  bufferToUtf8,
  convertJobOutputDataRefsToExpectedFormat,
  copyLargeBlobsToCloud,
  dataRefToBuffer,
  dataRefToDownloadLink,
  fetchJsonFromUrl,
  fetchRobust,
  getFinishedJobState,
  isDataRef,
  isDockerJobDefinitionRowFinished,
  isJobCacheAllowedToBeDeleted,
  resolveMostCorrectJob,
  sha256Buffer,
  shaDockerJob,
  shaObject,
  urlToUint8Array,
  utf8ToBuffer
};
//# sourceMappingURL=client.mjs.map
