require("dotenv").config();
const mongoose = require("mongoose");
const Student = require("../src/models/Student");
const faceProviderService = require("../src/services/faceProviderService");

const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/univote";

async function main() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required to refresh seeded student face enrollment.",
    );
  }

  await mongoose.connect(MONGO_URI);

  const students = await Student.find({
    photo_url: { $exists: true, $ne: null },
  }).select("_id tenant_id full_name matric_no photo_url");

  let updated = 0;
  let failed = 0;

  for (const student of students) {
    const enrollment = await faceProviderService.indexStudentFace(
      student.photo_url,
      { _id: student.tenant_id, slug: student.tenant_id.toString() },
      student,
    );
    if (!enrollment.success || !enrollment.aws_face_id) {
      await Student.updateOne(
        { _id: student._id },
        {
          $set: {
            aws_face_id: null,
            aws_face_image_id: null,
            aws_face_collection_id: null,
            last_face_enrolled_at: null,
            last_face_enrollment_error: enrollment.error || "Enrollment failed",
          },
        },
      );
      failed += 1;
      continue;
    }

    await Student.updateOne(
      { _id: student._id },
      {
        $set: {
          aws_face_id: enrollment.aws_face_id,
          aws_face_image_id: enrollment.aws_face_image_id,
          aws_face_collection_id: enrollment.aws_face_collection_id,
          last_face_enrolled_at: enrollment.enrolled_at || new Date(),
          last_face_enrollment_error: null,
        },
      },
    );
    updated += 1;
  }

  console.log(
    `AWS face enrollment refresh complete: ${updated} updated, ${failed} failed.`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Failed to refresh seeded AWS face enrollment:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
