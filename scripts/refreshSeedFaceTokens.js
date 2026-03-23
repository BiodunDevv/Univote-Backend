require("dotenv").config();
const mongoose = require("mongoose");
const Student = require("../src/models/Student");
const faceppService = require("../src/services/faceppService");

const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/univote";

async function main() {
  if (!process.env.FACEPP_API_KEY || !process.env.FACEPP_API_SECRET) {
    throw new Error(
      "FACEPP_API_KEY and FACEPP_API_SECRET are required to refresh student face tokens.",
    );
  }

  await mongoose.connect(MONGO_URI);

  faceppService.configure({
    api_key: process.env.FACEPP_API_KEY,
    api_secret: process.env.FACEPP_API_SECRET,
    base_url: process.env.FACEPP_BASE_URL,
    confidence_threshold: Number(process.env.FACE_CONFIDENCE_THRESHOLD || 80),
  });

  const students = await Student.find({
    photo_url: { $exists: true, $ne: null },
  }).select("_id full_name matric_no photo_url");

  let updated = 0;
  let failed = 0;

  for (const student of students) {
    const detection = await faceppService.detectFace(student.photo_url);
    if (!detection.success || !detection.face_token) {
      failed += 1;
      continue;
    }

    await Student.updateOne(
      { _id: student._id },
      { $set: { face_token: detection.face_token } },
    );
    updated += 1;
  }

  console.log(
    `Face token refresh complete: ${updated} updated, ${failed} failed.`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Failed to refresh seed face tokens:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
