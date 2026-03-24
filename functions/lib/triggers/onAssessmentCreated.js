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
exports.onAssessmentCreated = void 0;
/**
 * onAssessmentCreated — Recalculate skill pillar averages when a new assessment is added.
 */
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const db = admin.firestore();
exports.onAssessmentCreated = (0, firestore_1.onDocumentCreated)("keepers/{keeperId}/assessments/{assessmentId}", async (event) => {
    const keeperId = event.params.keeperId;
    const assessmentData = event.data?.data();
    if (!assessmentData) {
        firebase_functions_1.logger.warn("Assessment document has no data", { keeperId });
        return;
    }
    firebase_functions_1.logger.info("Assessment created, recomputing averages", { keeperId });
    // Fetch ALL assessments for this keeper
    const assessmentsSnap = await db
        .collection("keepers").doc(keeperId)
        .collection("assessments")
        .orderBy("assessmentDate", "desc")
        .get();
    // Compute rolling average per skill pillar
    const pillarTotals = {};
    const pillarCounts = {};
    for (const doc of assessmentsSnap.docs) {
        const ratings = doc.data().skillRatings;
        if (!ratings)
            continue;
        for (const [pillar, value] of Object.entries(ratings)) {
            if (typeof value !== "number" || value < 1 || value > 5)
                continue;
            pillarTotals[pillar] = (pillarTotals[pillar] || 0) + value;
            pillarCounts[pillar] = (pillarCounts[pillar] || 0) + 1;
        }
    }
    const skillPillarAverages = {};
    for (const pillar of Object.keys(pillarTotals)) {
        skillPillarAverages[pillar] = Math.round((pillarTotals[pillar] / pillarCounts[pillar]) * 100) / 100;
    }
    // Update aggregated scores on keeper profile
    await db.collection("keepers").doc(keeperId).update({
        skillPillarAverages,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    firebase_functions_1.logger.info("Skill pillar averages updated", { keeperId, skillPillarAverages });
    // Check milestone thresholds
    await checkMilestones(keeperId, skillPillarAverages);
});
/**
 * Check if any milestone conditions are met and create milestone docs.
 */
async function checkMilestones(keeperId, averages) {
    // Milestone: "Rising Star" — any pillar average >= 4.0
    for (const [pillar, avg] of Object.entries(averages)) {
        if (avg >= 4.0) {
            const milestoneId = `strong_${pillar}`;
            const milestoneRef = db
                .collection("keepers").doc(keeperId)
                .collection("milestones").doc(milestoneId);
            const existing = await milestoneRef.get();
            if (!existing.exists) {
                await milestoneRef.set({
                    id: milestoneId,
                    title: `Strong ${formatPillarName(pillar)}`,
                    description: `Achieved an average rating of ${avg}/5 in ${formatPillarName(pillar)}.`,
                    ageGroup: "U8-U13", // Applicable to all
                    skillPillar: pillar,
                    achieved: true,
                    achievedDate: admin.firestore.FieldValue.serverTimestamp(),
                    badgeIconName: "star.fill",
                });
                firebase_functions_1.logger.info("Milestone unlocked", { keeperId, milestoneId });
            }
        }
    }
}
function formatPillarName(key) {
    const names = {
        shotStopping: "Shot Stopping",
        crossesHighBalls: "Crosses & High Balls",
        oneVOneBreakaway: "1v1 & Breakaways",
        distribution: "Distribution",
        footworkAgility: "Footwork & Agility",
        tacticalAwareness: "Tactical Awareness",
        communication: "Communication",
        mentalPsychological: "Mental & Psychological",
    };
    return names[key] || key;
}
//# sourceMappingURL=onAssessmentCreated.js.map