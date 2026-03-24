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
exports.getParentDashboard = void 0;
/**
 * getParentDashboard — Curated, privacy-filtered view for parents.
 *
 * NEVER returns: raw scores, save %, mental health data, or 'private' visibility data.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("../utils/validation");
const db = admin.firestore();
exports.getParentDashboard = (0, https_1.onCall)(async (request) => {
    const { uid } = (0, validation_1.requireAuth)(request.auth);
    const { keeperId } = request.data;
    if (!keeperId) {
        throw new https_1.HttpsError("invalid-argument", "keeperId is required.");
    }
    // Verify caller is a linked parent
    const keeper = await (0, validation_1.getKeeperOrThrow)(keeperId);
    const isParent = keeper.parentUserIds?.includes(uid) ?? false;
    if (!isParent) {
        throw new https_1.HttpsError("permission-denied", "Only a linked parent can view this dashboard.");
    }
    // Fetch milestones — always visible to parents
    const milestonesSnap = await db
        .collection("keepers").doc(keeperId)
        .collection("milestones")
        .where("achieved", "==", true)
        .orderBy("achievedDate", "desc")
        .limit(20)
        .get();
    const milestones = milestonesSnap.docs.map((doc) => {
        const d = doc.data();
        return {
            title: d.title,
            achievedDate: d.achievedDate?.toDate()?.toISOString() ?? "",
            badgeIconName: d.badgeIconName,
        };
    });
    // Count sessions this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthTimestamp = admin.firestore.Timestamp.fromDate(monthStart);
    const [drillsSnap, matchesSnap] = await Promise.all([
        db.collection("keepers").doc(keeperId)
            .collection("drillSessions")
            .where("sessionDate", ">=", monthTimestamp)
            .get(),
        db.collection("keepers").doc(keeperId)
            .collection("matchReports")
            .where("matchDate", ">=", monthTimestamp)
            .get(),
    ]);
    // Compute improvement trend from shared assessments only
    const recentAssessments = await db
        .collection("keepers").doc(keeperId)
        .collection("assessments")
        .where("visibility", "==", "shared") // NEVER return private data
        .orderBy("assessmentDate", "desc")
        .limit(10)
        .get();
    let improvementTrend = "new";
    if (recentAssessments.size >= 4) {
        // Compare first half vs second half average ratings
        const docs = recentAssessments.docs;
        const half = Math.floor(docs.length / 2);
        const recent = docs.slice(0, half);
        const older = docs.slice(half);
        const avgRatings = (assessments) => {
            let total = 0;
            let count = 0;
            for (const a of assessments) {
                const ratings = a.data().skillRatings || {};
                for (const v of Object.values(ratings)) {
                    total += v;
                    count++;
                }
            }
            return count > 0 ? total / count : 0;
        };
        const recentAvg = avgRatings(recent);
        const olderAvg = avgRatings(older);
        improvementTrend = recentAvg > olderAvg + 0.2 ? "improving" : "maintaining";
    }
    else if (recentAssessments.size > 0) {
        improvementTrend = "new";
    }
    // Skill highlights — only from shared data, no raw scores
    const skillHighlights = [];
    if (keeper.skillPillarAverages) {
        for (const [pillar, _avg] of Object.entries(keeper.skillPillarAverages)) {
            // Don't expose mentalPsychological to parents
            if (pillar === "mentalPsychological")
                continue;
            skillHighlights.push({
                pillar,
                trend: improvementTrend === "improving" ? "up" : "stable",
            });
        }
    }
    return {
        keeperName: keeper.name,
        ageGroup: keeper.ageGroup,
        milestones,
        improvementTrend,
        sessionsThisMonth: drillsSnap.size,
        matchesThisMonth: matchesSnap.size,
        skillHighlights,
    };
});
//# sourceMappingURL=getParentDashboard.js.map