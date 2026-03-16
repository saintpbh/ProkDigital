const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// 1. Validate Passcode & Fetch Event Data
exports.validatePasscode = onRequest({ cors: true }, async (req, res) => {
    // Handle both body (POST) and query (GET/testing)
    const token = req.body?.token || req.query?.token;
    const passcode = req.body?.passcode || req.query?.passcode;

    if (!token || !passcode) {
        return res.status(400).json({ success: false, message: "Missing token or passcode" });
    }

    try {
        const eventRef = db.collection("events").doc(token);
        const doc = await eventRef.get();

        if (!doc.exists) {
            console.log(`[validatePasscode] Event not found for token: ${token}`);
            return res.status(404).json({ success: false, message: "Event not found" });
        }

        const eventData = doc.data();
        if (eventData.passcode !== passcode) {
            return res.status(401).json({ success: false, message: "Invalid passcode" });
        }

        return res.json({ success: true, event: eventData });
    } catch (error) {
        console.error("Error validating passcode:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// 2. Cast Vote
exports.castVote = onRequest({ cors: true }, async (req, res) => {
    const { token, voteId, choices, delegateId } = req.body;

    if (!token || !voteId || !choices) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        // Record the vote in a subcollection
        const voteRecordRef = db.collection("events").doc(token)
            .collection("votes").doc(voteId)
            .collection("records").doc(delegateId || admin.firestore().collection("_").doc().id);

        await voteRecordRef.set({
            choices,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Trigger a counter update (ideally via a background function or atomic increment)
        // For simplicity during migration, we can increment here or use a cloud function trigger
        
        return res.json({ success: true, message: "Vote cast successfully" });
    } catch (error) {
        console.error("Error casting vote:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});
