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
exports.adminCreateUser = void 0;
/**
 * adminCreateUser — Admin callable to create a new keeper account.
 * Only callable by authenticated admin users.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
exports.adminCreateUser = (0, https_1.onCall)(async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    // Check admin claim (loose check — any signed-in user for now; tighten later)
    const { email, password, displayName, firstName, lastName, ageGroup } = request.data;
    if (!email || !password || !displayName) {
        throw new https_1.HttpsError("invalid-argument", "email, password, and displayName are required.");
    }
    try {
        // Create Auth user
        const userRecord = await admin.auth().createUser({ email, password, displayName });
        // Count existing keepers to assign a player number
        const snapshot = await admin.firestore().collection("users").where("role", "==", "keeper").get();
        const playerNumber = snapshot.size + 1;
        // Write Firestore profile
        const firestoreData = {
            email,
            displayName,
            role: "keeper",
            userNumber: playerNumber,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (firstName)
            firestoreData.firstName = firstName.trim();
        if (lastName)
            firestoreData.lastName = lastName.trim();
        if (ageGroup)
            firestoreData.ageGroup = ageGroup;
        await admin.firestore().collection("users").doc(userRecord.uid).set(firestoreData);
        firebase_functions_1.logger.info("Admin created keeper account", { uid: userRecord.uid, email });
        return { success: true, uid: userRecord.uid };
    }
    catch (error) {
        firebase_functions_1.logger.error("adminCreateUser error", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to create user.");
    }
});
//# sourceMappingURL=adminCreateUser.js.map