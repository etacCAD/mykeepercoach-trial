# Goalie Coach Platform Roadmap

This document outlines the high-level roadmap and planned architectural updates for the My Keeper Coach platform.

## Near-Term Objectives (Up Next)
* **iOS Web Upload Resilience:** Finalize background service workers and wake-lock APIs to ensure seamless 1GB+ uploads even when the browser is backgrounded on mobile Safari.
* **Skill-Based Analytics Expansion:** Enhance the dashboard overview to support granular performance isolation by skill (e.g., toggling visual charts between saves vs distributions vs intercepts).

## Mid-Term Features (In Design)
* **Iterative Game Session Updates ("Add Clip to Game")**
    * *Objective:* Allow users to upload forgotten or newly-discovered clips to a game that has already been analyzed. 
    * *Architecture Details:* Because Gemini interprets chronological match context from a single combined array of video files, appending a single video mathematically breaks the written narrative play-by-play.
    * *Implementation Plan:* A dedicated "Add Clip & Re-Analyze" UI button that appends the new media source to the Firebase array, archives the old "V1" report as a historical artifact, and re-triggers the prompt sequence with the total combined videos from scratch to guarantee a cohesive single AI report.

## Long-Term Vision

### 1. Role-Based Access Control (RBAC) & View-Only Sharing
* **Goalkeeper Perspective (Invites):** Enable keepers to invite users (Coaches, Parents, Recruiters) to their instance with "View-Only" permissions, ensuring outsiders can see reports and videos but cannot alter data, upload, or delete.
* **Coach Dashboard:** Create a dedicated "Coach View" where a single coach can monitor an aggregated roster of all the individual goalkeepers who have explicitly invited them to view their profiles.

### 2. Drill Content Library & AI Integration
* **Content Platform:** Ingest and host the proprietary database of goalie drills directly within the platform.
* **Automated AI Coaching (Ted):** Upgrade the `tedChat` AI agent to intelligently recommend these specific drills when users ask for help.
* **Contextual Report Recommendations:** Modify the Gemini AI prompts across game reports so that when the AI identifies a weakness (e.g., poor diving form), it explicitly hyperlinks to age-appropriate drills from the proprietary database within the "Actionable Feedback" section.

### 3. Practice Session Modality
* **Upload Categorization:** Allow players to toggle between uploading a "Game" and uploading a "Practice Session".
* **Data Isolation:** Design a segregated reporting schema. Practice sessions will generate detailed analytics on execution and repetitions but will be strictly isolated from the Keeper's overall "Game Rating" (so experimenting in practice doesn't ruin their match averages).

### 4. High-Resolution Technical Analysis
* **Granular Biomechanics Metrics:** Expand the computer vision and AI prompts to evaluate micro-technical skills instead of just binary macro outcomes (e.g., Save vs Goal). 
* **Specific Tracking Ideas:**
    * *Hand Position (The "W"):* Assessing if the hands are correctly contorted in a "W" shape upon contact.
    * *Reaction Time Engineering:* Attempting to calculate explosive reaction metrics from the frame of the strike to the frame of player movement.
