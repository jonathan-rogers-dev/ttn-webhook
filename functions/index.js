/* eslint-disable max-len */

/**
 * This is the main file for the Firebase Cloud Function.
 * This function is triggered by an HTTP request from The Things Network (TTN).
 * The function takes the data from the request and pushes it to the
 * Supabase database and the Firebase Realtime Database.
 */


require("dotenv").config();

// Get the function key
const functionKey = process.env.FUNCTION_KEY;

// Initialize the Supabase client
const {createClient} = require("@supabase/supabase-js");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize the Firebase Admin SDK
const admin = require("firebase-admin");
const {onRequest} = require("firebase-functions/v2/https");
const sAPath = "./sound-around-town-firebase-adminsdk-6hgg3-851791b77d.json";
const serviceAccount = require(sAPath);
const databaseURL = process.env.NEXT_FIREBASE_DATABASE_URL;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: databaseURL,
});

/**
 * Gets HTTP request from TTN
 */
exports.ttn_webhook = onRequest(
    {cors: true}, // Automatically sets CORS headers
    (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      if (req.headers.authorization !== functionKey) {
        res.status(401).send("Unauthorized");
        return;
      }

      appendData(req.body);
      res.status(200).send("Connection Successful");
    },
);


/**
 * This function takes the data from the TTN request and pushes it to the
 * Supabase database and the Firebase Realtime Database.
 * @param {*} req Data from sensor
 */
async function appendData(req) {
  console.log("Received Data: ", req);

  try {
    const dateString = req.received_at;
    const battery = req.uplink_message.decoded_payload.battery;
    const freqWeight = req.uplink_message.decoded_payload.freq_weight;
    const la = req.uplink_message.decoded_payload.la;
    const laeq = req.uplink_message.decoded_payload.laeq;
    const lamax = req.uplink_message.decoded_payload.lamax;
    const timeWeight = req.uplink_message.decoded_payload.time_weight;

    // Handles a non-payload request
    if (la == null && laeq == null && lamax == null && freqWeight == null && timeWeight == null && battery == null) {
      console.info("Info: Invalid data");
      return;
    }

    // Handles incomplete payload
    if (la == null || laeq == null || lamax == null || freqWeight == null || timeWeight == null || battery == null) {
      console.warn("Warning: Incomplete data");
    }

    // Push data to Postgres database
    const {data, error} = await supabase
        .from("data")
        .insert([
          {"received_at": dateString, "device_id": "sat-0001", "la": la, "la_eq": laeq, "la_max": lamax, "freq_weight": freqWeight, "time_weight": timeWeight, "battery": battery},
        ])
        .select();

    if (error != null) {
      onError(error);
    }

    // Display data contents on console
    console.log("Parsed Data: [" + data[0].id + "]", dateString, battery, freqWeight, la, laeq, lamax, timeWeight);
    console.log("Supaase Return: [" + data[0].id + "]", data);

    // Push the data to Firebase Database
    const db = admin.database();
    const ref = db.ref("/");
    const usersRef = ref.child(data[0].id);

    usersRef.set({
      received_at: dateString,
      device_id: "sat-0001",
      la: la,
      la_eq: laeq,
      la_max: lamax,
      freq_weight: freqWeight,
      time_weight: timeWeight,
      battery: battery,
      uuid: data[0].uuid,
    });
  } catch (error) {
    onError(error);
  }
}

/**
 * Handles a error error
 * @param {*} error Error
 */
function onError(error) {
  console.error("Error: ", error);
}

