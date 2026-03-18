const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// 1. Validate Passcode & Fetch Event Data
exports.validatePasscode = functions.https.onRequest(async (req, res) => {
    // Basic CORS handling for v1
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        return res.status(204).send('');
    }

    const token = req.body?.token || req.query?.token;
    const passcode = (req.body?.passcode !== undefined) ? req.body.passcode : req.query?.passcode;

    if (!token) {
        return res.status(400).json({ success: false, message: "Missing token" });
    }

    try {
        const snapshot = await db.collection("events").where("token", "==", token).limit(1).get();
        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: "Event not found" });
        }
        const doc = snapshot.docs[0];
        const eventData = { id: doc.id, ...doc.data() };
        
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
exports.castVote = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).send('');
    }

    const { token, voteId, choices, delegateId } = req.body;
    if (!token || !voteId || !choices) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    try {
        const eventSnapshot = await db.collection("events").where("token", "==", token).limit(1).get();
        if (eventSnapshot.empty) {
            return res.status(404).json({ success: false, message: "Event not found" });
        }
        const eventId = eventSnapshot.docs[0].id;

        const voteRecordRef = db.collection("votes").doc(voteId)
            .collection("records").doc(delegateId || admin.firestore().collection("_").doc().id);

        await voteRecordRef.set({
            choices,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.json({ success: true, message: "Vote cast successfully" });
    } catch (error) {
        console.error("Error casting vote:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// 3. Send Push Notification on Announcement Update
exports.sendAnnouncementPush = functions.firestore
    .document("events/{eventId}")
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    if (after.current_announcement && before.current_announcement !== after.current_announcement) {
        try {
            const tokensSnap = await db.collection("events").doc(context.params.eventId).collection("delegateTokens").get();
            if (tokensSnap.empty) return;
            
            const tokens = tokensSnap.docs.map(doc => doc.data().token);
            const payload = {
                notification: {
                    title: "공지사항 알림: " + after.name,
                    body: after.current_announcement
                }
            };
            
            await admin.messaging().sendEachForMulticast({
                tokens,
                notification: payload.notification
            });
        } catch (error) {
            console.error("Error sending announcement push:", error);
        }
    }
});

// 4. Send Push Notification on New Vote Open
exports.sendVotePush = functions.firestore
    .document("votes/{voteId}")
    .onWrite(async (change, context) => {
    const after = change.after ? change.after.data() : null;
    const before = change.before ? change.before.data() : null;
    if (!after) return;

    if (after.status === 'OPEN' && (!before || before.status !== 'OPEN')) {
        try {
            const eventId = after.eventId;
            if (!eventId) return;

            const tokensSnap = await db.collection("events").doc(eventId).collection("delegateTokens").get();
            if (tokensSnap.empty) return;

            const tokens = tokensSnap.docs.map(doc => doc.data().token);
            const payload = {
                notification: {
                    title: "🗳️ 새로운 투표 진행 중",
                    body: after.question
                }
            };

            await admin.messaging().sendEachForMulticast({
                tokens,
                notification: payload.notification
            });
        } catch (error) {
            console.error("Error sending vote push:", error);
        }
    }
});
