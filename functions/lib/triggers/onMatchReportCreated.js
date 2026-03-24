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
exports.onMatchReportCreated = void 0;
/**
 * onMatchReportCreated — Update rolling match stats and check milestones.
 */
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const db = admin.firestore();
exports.onMatchReportCreated = (0, firestore_1.onDocumentCreated)("keepers/{keeperId}/matchReports/{reportId}", async (event) => {
    const keeperId = event.params.keeperId;
    const report = event.data?.data();
    if (!report) {
        firebase_functions_1.logger.warn("Match report has no data", { keeperId });
        return;
    }
    firebase_functions_1.logger.info("Match report created, updating stats", { keeperId });
    // Fetch last 5 match reports for rolling stats
    const reportsSnap = await db
        .collection("keepers").doc(keeperId)
        .collection("matchReports")
        .orderBy("matchDate", "desc")
        .limit(5)
        .get();
    // Compute rolling save percentage
    let totalSaves = 0;
    let totalShots = 0;
    let totalRating = 0;
    let cleanSheets = 0;
    for (const doc of reportsSnap.docs) {
        const data = doc.data();
        totalSaves += data.saves ?? 0;
        totalShots += data.shotsOnTargetFaced ?? 0;
        totalRating += data.overallRating ?? 0;
        if ((data.goalsConceded ?? 0) === 0)
            cleanSheets++;
    }
    const matchCount = reportsSnap.size;
    const rollingSavePercentage = totalShots > 0
        ? Math.round((totalSaves / totalShots) * 10000) / 100
        : null;
    const rollingAvgRating = matchCount > 0
        ? Math.round((totalRating / matchCount) * 100) / 100
        : null;
    // Get total match count
    const allMatchesSnap = await db
        .collection("keepers").doc(keeperId)
        .collection("matchReports")
        .count()
        .get();
    const totalMatchCount = allMatchesSnap.data().count;
    // Update keeper profile with aggregated stats
    await db.collection("keepers").doc(keeperId).update({
        matchCount: totalMatchCount,
        rollingSavePercentage,
        lastMatchRating: report.overallRating ?? null,
        rollingAvgRating,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    firebase_functions_1.logger.info("Match stats updated", {
        keeperId,
        matchCount: totalMatchCount,
        rollingSavePercentage,
    });
    // ── Milestone checks ──────────────────────────────────
    // "First Clean Sheet"
    if ((report.goalsConceded ?? 0) === 0) {
        await createMilestoneIfNew(keeperId, "first_clean_sheet", {
            title: "First Clean Sheet",
            description: "Kept a clean sheet — zero goals conceded!",
            badgeIconName: "shield.checkered",
        });
    }
    // "First Match" — logged at least one match
    if (totalMatchCount === 1) {
        await createMilestoneIfNew(keeperId, "first_match", {
            title: "First Match Logged",
            description: "Your first match report has been created.",
            badgeIconName: "flag.fill",
        });
    }
    // "Five Matches" — milestone
    if (totalMatchCount >= 5) {
        await createMilestoneIfNew(keeperId, "five_matches", {
            title: "5 Matches Logged",
            description: "Five match reports complete — building a picture of performance.",
            badgeIconName: "5.circle.fill",
        });
    }
    // "90%+ Save Percentage" (rolling 5 matches)
    if (rollingSavePercentage !== null && rollingSavePercentage >= 90) {
        await createMilestoneIfNew(keeperId, "save_percentage_90", {
            title: "90%+ Save Rate",
            description: `Rolling save percentage of ${rollingSavePercentage}% over last 5 matches.`,
            badgeIconName: "hand.raised.fill",
        });
    }
    // "90%+ Distribution Accuracy" (this match)
    if (report.distributionAccuracyPercent && report.distributionAccuracyPercent >= 0.9) {
        await createMilestoneIfNew(keeperId, "distribution_accuracy_90", {
            title: "Pinpoint Distribution",
            description: "Achieved 90%+ distribution accuracy in a match.",
            badgeIconName: "target",
        });
    }
});
async function createMilestoneIfNew(keeperId, milestoneId, data) {
    const ref = db
        .collection("keepers").doc(keeperId)
        .collection("milestones").doc(milestoneId);
    const existing = await ref.get();
    if (!existing.exists) {
        await ref.set({
            id: milestoneId,
            ...data,
            ageGroup: "U8-U13",
            achieved: true,
            achievedDate: admin.firestore.FieldValue.serverTimestamp(),
        });
        firebase_functions_1.logger.info("Milestone unlocked", { keeperId, milestoneId });
    }
}
//# sourceMappingURL=onMatchReportCreated.js.map