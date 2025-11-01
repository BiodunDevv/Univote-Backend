require("dotenv").config();
const mongoose = require("mongoose");
const Student = require("./src/models/Student");

async function checkStudents() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const total = await Student.countDocuments();
    const withFace = await Student.countDocuments({
      face_token: { $ne: null },
    });
    const withPhoto = await Student.countDocuments({
      photo_url: { $ne: null },
    });

    console.log("\n📊 Student Statistics:");
    console.log(`   Total students: ${total}`);
    console.log(`   With photo_url: ${withPhoto}`);
    console.log(`   With face_token: ${withFace}`);
    console.log(
      `   Success rate: ${
        total > 0 ? ((withFace / total) * 100).toFixed(1) : 0
      }%\n`
    );

    if (withFace > 0) {
      const sampleStudent = await Student.findOne({ face_token: { $ne: null } })
        .select("matric_no full_name photo_url face_token")
        .lean();

      console.log("✅ Sample student with facial data:");
      console.log(`   Matric: ${sampleStudent.matric_no}`);
      console.log(`   Name: ${sampleStudent.full_name}`);
      console.log(`   Photo URL: ${sampleStudent.photo_url ? "Yes" : "No"}`);
      console.log(
        `   Face Token: ${sampleStudent.face_token.substring(0, 20)}...`
      );
    } else {
      console.log("⚠️  No students have face tokens yet.");
      console.log("   This means Face++ API failed during seeding.");
      console.log(
        "   Students were created but without facial verification data."
      );
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkStudents();
