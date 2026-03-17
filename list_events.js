const admin = require("firebase-admin");
const serviceAccount = require("./prok-ga-firebase-adminsdk-fbsvc-b88c438d41.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function listEvents() {
    try {
        const snapshot = await db.collection("events").get();
        if (snapshot.empty) {
            console.log("No events found in Firestore.");
        } else {
            console.log("Events found:");
            snapshot.forEach(doc => {
                console.log(`${doc.id} =>`, doc.data());
            });
        }
    } catch (error) {
        console.error("Error listing events:", error);
    } finally {
        process.exit(0);
    }
}

listEvents();
