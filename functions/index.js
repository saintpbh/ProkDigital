const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// 1. Validate Passcode & Fetch Event Data
exports.validatePasscode = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
    // Handle both body (POST) and query (GET/testing)
    const token = req.body?.token || req.query?.token;
    // Use nullish coalescing to allow empty string
    const passcode = (req.body?.passcode !== undefined) ? req.body.passcode : req.query?.passcode;

    if (!token) {
        return res.status(400).json({ success: false, message: "Missing token" });
    }

    try {
        // Query the events collection where token == token
        const snapshot = await db.collection("events").where("token", "==", token).limit(1).get();

        if (snapshot.empty) {
            console.log(`[validatePasscode] Event not found for token: ${token}`);
            return res.status(404).json({ success: false, message: "Event not found" });
        }

        const doc = snapshot.docs[0];
        const eventData = { id: doc.id, ...doc.data() };
        
        // If passcode is empty string (just checking if event exists)
        if (passcode === '') {
            return res.json({ 
                success: true, 
                event: { id: eventData.id, name: eventData.name, token: eventData.token, passcode: !!eventData.passcode } 
            });
        }

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
exports.castVote = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
    const { token, voteId, choices, delegateId } = req.body;

    if (!token || !voteId || !choices) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        // First find the event by token
        const eventSnapshot = await db.collection("events").where("token", "==", token).limit(1).get();
        if (eventSnapshot.empty) {
            return res.status(404).json({ success: false, message: "Event not found" });
        }
        
        const eventId = eventSnapshot.docs[0].id;

        // Record the vote in a subcollection or root collection
        // For now, let's just make sure it succeeds
        const voteRecordRef = db.collection("votes").doc(voteId)
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
