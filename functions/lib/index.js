"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = exports.onVideoUploaded = exports.onWebSessionUploaded = exports.onUserCreated = exports.tedChat = exports.redeemPromoCode = exports.checkTrialStatus = exports.activateTrial = exports.analyzeV2 = exports.reAnalyzeSession = exports.adminDeleteUser = exports.adminUpdateUser = exports.adminCreateUser = void 0;
/**
 * Goalie Coach — Cloud Functions Entry Point
 *
 * All function exports for Firebase deployment.
 * Web-only product — no iOS functions.
 */
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin SDK
admin.initializeApp();
// ── Callable Functions ──────────────────────────────────────
var adminCreateUser_1 = require("./callables/adminCreateUser");
Object.defineProperty(exports, "adminCreateUser", { enumerable: true, get: function () { return adminCreateUser_1.adminCreateUser; } });
var adminUpdateUser_1 = require("./callables/adminUpdateUser");
Object.defineProperty(exports, "adminUpdateUser", { enumerable: true, get: function () { return adminUpdateUser_1.adminUpdateUser; } });
var adminDeleteUser_1 = require("./callables/adminDeleteUser");
Object.defineProperty(exports, "adminDeleteUser", { enumerable: true, get: function () { return adminDeleteUser_1.adminDeleteUser; } });
var reAnalyzeSession_1 = require("./callables/reAnalyzeSession");
Object.defineProperty(exports, "reAnalyzeSession", { enumerable: true, get: function () { return reAnalyzeSession_1.reAnalyzeSession; } });
var analyzeV2_1 = require("./callables/analyzeV2");
Object.defineProperty(exports, "analyzeV2", { enumerable: true, get: function () { return analyzeV2_1.analyzeV2; } });
var activateTrial_1 = require("./callables/activateTrial");
Object.defineProperty(exports, "activateTrial", { enumerable: true, get: function () { return activateTrial_1.activateTrial; } });
var checkTrialStatus_1 = require("./callables/checkTrialStatus");
Object.defineProperty(exports, "checkTrialStatus", { enumerable: true, get: function () { return checkTrialStatus_1.checkTrialStatus; } });
var redeemPromoCode_1 = require("./callables/redeemPromoCode");
Object.defineProperty(exports, "redeemPromoCode", { enumerable: true, get: function () { return redeemPromoCode_1.redeemPromoCode; } });
var tedChat_1 = require("./callables/tedChat");
Object.defineProperty(exports, "tedChat", { enumerable: true, get: function () { return tedChat_1.tedChat; } });
// ── Firestore Triggers ──────────────────────────────────────
var onUserCreated_1 = require("./triggers/onUserCreated");
Object.defineProperty(exports, "onUserCreated", { enumerable: true, get: function () { return onUserCreated_1.onUserCreated; } });
// ── Storage Triggers ────────────────────────────────────────
var onWebSessionUploaded_1 = require("./triggers/onWebSessionUploaded");
Object.defineProperty(exports, "onWebSessionUploaded", { enumerable: true, get: function () { return onWebSessionUploaded_1.onWebSessionUploaded; } });
var onVideoUploaded_1 = require("./triggers/onVideoUploaded");
Object.defineProperty(exports, "onVideoUploaded", { enumerable: true, get: function () { return onVideoUploaded_1.onVideoUploaded; } });
// ── Web Backend API ─────────────────────────────────────────
var api_1 = require("./api");
Object.defineProperty(exports, "api", { enumerable: true, get: function () { return api_1.api; } });
//# sourceMappingURL=index.js.map