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

    try {
        let snapshot;

        if (token) {
            // Explicit token → find event by token
            snapshot = await db.collection("events").where("token", "==", token).limit(1).get();
        } else {
            // No token → auto-detect latest active event
            try {
                snapshot = await db.collection("events")
                    .where("is_active", "==", true)
                    .orderBy("created_at", "desc")
                    .limit(1).get();
            } catch (indexErr) {
                // Fallback: index not yet built → just get any active event
                console.warn("Composite index not ready, using fallback query:", indexErr.message);
                snapshot = await db.collection("events")
                    .where("is_active", "==", true)
                    .limit(1).get();
            }
        }

        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: token ? "Event not found" : "No active event" });
        }

        const doc = snapshot.docs[0];
        const eventData = { id: doc.id, ...doc.data() };
        
        if (passcode === '' || passcode === undefined || passcode === null) {
            return res.json({ 
                success: true, 
                event: { id: eventData.id, name: eventData.name, token: eventData.token, passcode: !!eventData.passcode } 
            });
        }
        if (String(eventData.passcode) !== String(passcode)) {
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

// Helper to send multicast push with batching (max 500 per batch) and token cleanup
async function sendMulticastPush(eventId, tokens, payload) {
    if (!tokens || tokens.length === 0) return;
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    
    for (let i = 0; i < uniqueTokens.length; i += 500) {
        const chunk = uniqueTokens.slice(i, i + 500);
        try {
            const response = await admin.messaging().sendEachForMulticast({
                tokens: chunk,
                notification: payload.notification,
                webpush: payload.webpush,
                data: payload.data
            });
            
            // Clean up invalid or unregistered tokens
            if (response.failureCount > 0 && eventId) {
                const batch = db.batch();
                let cleanupCount = 0;
                response.responses.forEach((resp, idx) => {
                    if (!resp.success && resp.error) {
                        const errCode = resp.error.code;
                        if (
                            errCode === 'messaging/registration-token-not-registered' ||
                            errCode === 'messaging/invalid-registration-token'
                        ) {
                            const invalidToken = chunk[idx];
                            const tokenRef = db.collection("events").doc(eventId).collection("delegateTokens").doc(invalidToken);
                            batch.delete(tokenRef);
                            cleanupCount++;
                        }
                    }
                });
                if (cleanupCount > 0) {
                    await batch.commit();
                    console.log(`Cleaned up ${cleanupCount} invalid FCM tokens for event ${eventId}`);
                }
            }
        } catch (err) {
            console.error("Error sending batch push:", err);
        }
    }
}

// 3. Send Push Notification on Announcement Update
exports.sendAnnouncementPush = functions.firestore
    .document("events/{eventId}")
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const eventId = context.params.eventId;
    
    const isNew = after.current_announcement && (
        before.current_announcement !== after.current_announcement ||
        before.current_announcement_ts !== after.current_announcement_ts
    );

    if (isNew) {
        try {
            const tokensSnap = await db.collection("events").doc(eventId).collection("delegateTokens").get();
            if (tokensSnap.empty) return;
            
            const tokens = [...new Set(tokensSnap.docs.map(doc => doc.data().token).filter(Boolean))];
            const cleanTitle = (after.name || "디지털 총회") + " 공지사항";
            const cleanBody = String(after.current_announcement).replace(/[📢📣]/g, '').trim();

            const payload = {
                notification: {
                    title: cleanTitle,
                    body: cleanBody
                },
                webpush: {
                    notification: {
                        title: cleanTitle,
                        body: cleanBody,
                        icon: "/icon-192.png",
                        badge: "/icon-192.png",
                        tag: "prok-announcement",
                        renotify: true,
                        vibrate: [200, 100, 200]
                    },
                    fcmOptions: {
                        link: "https://digital.prok.or.kr/"
                    }
                },
                data: {
                    type: "announcement",
                    title: cleanTitle,
                    body: cleanBody,
                    url: "https://digital.prok.or.kr/"
                }
            };
            
            await sendMulticastPush(eventId, tokens, payload);
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

            const tokens = [...new Set(tokensSnap.docs.map(doc => doc.data().token).filter(Boolean))];
            const payload = {
                notification: {
                    title: "🗳️ 새로운 투표가 시작되었습니다",
                    body: after.question
                },
                webpush: {
                    notification: {
                        title: "🗳️ 새로운 투표가 시작되었습니다",
                        body: after.question,
                        icon: "/icon-192.png",
                        badge: "/icon-192.png",
                        tag: "prok-vote",
                        renotify: true,
                        vibrate: [200, 100, 200]
                    },
                    fcmOptions: {
                        link: "https://digital.prok.or.kr/"
                    }
                },
                data: {
                    type: "vote",
                    url: "https://digital.prok.or.kr/"
                }
            };

            await sendMulticastPush(eventId, tokens, payload);
        } catch (error) {
            console.error("Error sending vote push:", error);
        }
    }
});

// 5. Send Push Notification on New Public File Shared
exports.sendFilePush = functions.firestore
    .document("files/{fileId}")
    .onWrite(async (change, context) => {
    const after = change.after ? change.after.data() : null;
    const before = change.before ? change.before.data() : null;
    if (!after) return;

    // Trigger when file is newly created as public OR changed from private to public
    const newlyPublic = after.is_public && (!before || !before.is_public);
    if (newlyPublic) {
        try {
            const eventId = after.eventId;
            if (!eventId) return;

            const tokensSnap = await db.collection("events").doc(eventId).collection("delegateTokens").get();
            if (tokensSnap.empty) return;

            const tokens = [...new Set(tokensSnap.docs.map(doc => doc.data().token).filter(Boolean))];
            const payload = {
                notification: {
                    title: "📄 새로운 회의 문서 공유",
                    body: `"${after.title}" 문서가 공유되었습니다.`
                },
                webpush: {
                    notification: {
                        title: "📄 새로운 회의 문서 공유",
                        body: `"${after.title}" 문서가 공유되었습니다.`,
                        icon: "/icon-192.png",
                        badge: "/icon-192.png",
                        tag: "prok-file",
                        renotify: true
                    },
                    fcmOptions: {
                        link: "https://digital.prok.or.kr/"
                    }
                },
                data: {
                    type: "file",
                    url: "https://digital.prok.or.kr/"
                }
            };

            await sendMulticastPush(eventId, tokens, payload);
        } catch (error) {
            console.error("Error sending file push:", error);
        }
    }
});
