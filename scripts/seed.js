require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Student = require("../src/models/Student");
const Admin = require("../src/models/Admin");
const VotingSession = require("../src/models/VotingSession");
const Candidate = require("../src/models/Candidate");
const Vote = require("../src/models/Vote");
const AuditLog = require("../src/models/AuditLog");
const emailService = require("../src/services/emailService");

// College and Department mappings (Bowen University)
const collegesAndDepartments = {
  "College of Agriculture, Engineering and Science": {
    code: "COAES",
    departments: [
      "Microbiology",
      "Pure and Applied Biology",
      "Biochemistry",
      "Industrial Chemistry",
      "Mathematics",
      "Statistics",
      "Physics",
      "Agriculture",
      "Food Science and Technology",
      "Electrical/Electronics Engineering",
      "Mechatronics Engineering",
      "Extension and Social Engineering",
    ],
  },
  "College of Management and Social Sciences": {
    code: "COMSS",
    departments: [
      "Accounting",
      "Banking and Finance",
      "Business Administration",
      "Industrial Relations and Personnel Management",
      "Economics",
      "Sociology",
      "Political Science",
      "International Relations",
      "Political and Law",
    ],
  },
  "College of Law": {
    code: "COLAW",
    departments: ["Law"],
  },
  "College of Liberal Studies": {
    code: "COLBS",
    departments: [
      "Music",
      "Theatre Arts",
      "English",
      "History and International Studies",
      "Religious Studies",
    ],
  },
  "College of Health Sciences": {
    code: "COHES",
    departments: [
      "Anatomy",
      "Physiology",
      "Medicine and Surgery",
      "Nursing Science",
      "Physiotherapy",
      "Public Health",
      "Medical Laboratory Science",
      "Nutrition and Dietetics",
    ],
  },
  "College of Computing and Communication Studies": {
    code: "COCCS",
    departments: [
      "Computer Science",
      "Mass Communication",
      "Communication Arts",
      "Cyber Security",
      "Software Engineering",
      "Information Technology",
    ],
  },
  "College of Environmental Sciences": {
    code: "COEVS",
    departments: ["Architecture", "Surveying and Geoinformatics"],
  },
};

// Student names for realistic data
const firstNames = [
  "Adebayo",
  "Chioma",
  "Emmanuel",
  "Fatima",
  "Ibrahim",
  "Jennifer",
  "Kunle",
  "Loveth",
  "Muhammad",
  "Ngozi",
  "Oluwatobi",
  "Peace",
  "Samuel",
  "Temitope",
  "Uche",
  "Victoria",
  "Williams",
  "Yetunde",
  "Zainab",
  "Ahmed",
  "Blessing",
  "Chinedu",
  "Daniel",
  "Esther",
  "Felix",
  "Grace",
  "Hassan",
  "Ifeoma",
  "Joshua",
  "Kemi",
  "Lateef",
  "Mercy",
  "Nathaniel",
  "Onyeka",
  "Peter",
  "Queen",
  "Rachel",
  "Stephen",
  "Tunde",
  "Uzoma",
  "Vincent",
  "Wuraola",
];

const lastNames = [
  "Adeyemi",
  "Bello",
  "Chukwu",
  "Danjuma",
  "Eze",
  "Fawole",
  "Garba",
  "Hassan",
  "Idris",
  "James",
  "Kalu",
  "Lawal",
  "Musa",
  "Nwosu",
  "Obi",
  "Peters",
  "Quadri",
  "Raji",
  "Sani",
  "Taiwo",
  "Usman",
  "Victor",
  "Williams",
  "Yusuf",
  "Afolabi",
  "Bassey",
  "Chibueze",
  "Dimka",
  "Emeka",
  "Femi",
  "Gbenga",
  "Habib",
];

/**
 * Generate matric number in BU format
 * Format: BU{YY}{COLLEGE_CODE}{NUMBER}
 * Example: BU22CSC1001
 */
function generateMatricNo(year, collegeCode, index) {
  const yearCode = year.toString().slice(-2);
  const studentNumber = String(index).padStart(4, "0");
  return `BU${yearCode}${collegeCode}${studentNumber}`;
}

/**
 * Generate random email
 */
function generateEmail(firstName, lastName, matric) {
  const cleanFirst = firstName.toLowerCase().replace(/\s/g, "");
  const cleanLast = lastName.toLowerCase().replace(/\s/g, "");
  return `${cleanFirst}.${cleanLast}@student.bowenuniversity.edu.ng`;
}

/**
 * Get random element from array
 */
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

/**
 * Clear all collections
 */
async function clearDatabase() {
  console.log("\n🗑️  Clearing database...");

  await Student.deleteMany({});
  await Admin.deleteMany({});
  await VotingSession.deleteMany({});
  await Candidate.deleteMany({});
  await Vote.deleteMany({});
  await AuditLog.deleteMany({});

  console.log("✅ Database cleared");
}

/**
 * Create super admin
 */
async function createAdmin() {
  console.log("\n👤 Creating admin account...");

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("balikiss12", salt);

  const admin = new Admin({
    email: "louisdiaz43@gmail.com",
    password_hash: passwordHash,
    full_name: "Super Administrator",
    role: "super_admin",
  });

  await admin.save();

  console.log("✅ Admin created");
  console.log("   Email: louisdiaz43@gmail.com");
  console.log("   Password: balikiss12");
}

/**
 * Generate students
 */
async function generateStudents() {
  console.log("\n👨‍🎓 Generating students...");

  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash("1234", salt);

  const students = [];
  const levels = ["100", "200", "300", "400"];

  let studentCounter = 0;
  let isFirstComputerScienceStudent = true;
  let isFirstNonCOAESStudent = true;

  for (const [collegeName, collegeInfo] of Object.entries(
    collegesAndDepartments
  )) {
    const collegeCode = collegeInfo.code;

    for (const department of collegeInfo.departments) {
      // Create exactly 2 students per department
      for (let i = 0; i < 2; i++) {
        studentCounter++;

        // Default values
        let firstName = randomElement(firstNames);
        let lastName = randomElement(lastNames);
        let level = randomElement(levels);
        let enrollmentYear = 2022;
        let matricNo = generateMatricNo(
          enrollmentYear,
          collegeCode,
          studentCounter
        );
        let email = generateEmail(firstName, lastName, matricNo);

        // Special case 1: First student in Computer Science department (COCCS)
        if (
          department === "Computer Science" &&
          collegeCode === "COCCS" &&
          isFirstComputerScienceStudent
        ) {
          firstName = "Muhammed";
          lastName = "Abiodun";
          matricNo = "BU22CSC1005";
          email = "muhammedabiodun42@gmail.com";
          level = "400";
          isFirstComputerScienceStudent = false;
          console.log(
            `   🎯 Creating special student: ${firstName} ${lastName} - ${email}`
          );
        }
        // Special case 2: First student in COMSS (College of Management and Social Sciences)
        else if (collegeCode === "COMSS" && isFirstNonCOAESStudent) {
          firstName = "Mustapha";
          lastName = "Muhammed";
          email = "Mustapha.muhammed@bowen.edu.ng";
          level = randomElement(levels);
          isFirstNonCOAESStudent = false;
          console.log(
            `   🎯 Creating special student: ${firstName} ${lastName} - ${email}`
          );
        }

        const student = {
          matric_no: matricNo,
          full_name: `${firstName} ${lastName}`,
          email: email,
          password_hash: defaultPasswordHash,
          department: department,
          college: collegeName,
          level: level,
          first_login: true,
          has_voted_sessions: [],
          is_logged_in: false,
        };

        students.push(student);
      }
    }
  }

  // Insert all students
  const insertedStudents = await Student.insertMany(students);

  console.log(`✅ Generated ${insertedStudents.length} students`);
  console.log(`   📧 Welcome emails will be sent after first password change`);

  return insertedStudents;
}

/**
 * Main seed function
 */
async function seed() {
  console.log("🌱 Starting database seed...\n");
  console.log("=".repeat(50));

  try {
    await connectDB();
    await clearDatabase();
    await createAdmin();
    await generateStudents();

    console.log("\n" + "=".repeat(50));
    console.log("✅ Seed completed successfully!\n");
    console.log("📝 Summary:");
    console.log(`   - Admin: louisdiaz43@gmail.com (password: balikiss12)`);
    console.log(`   - Special Students:`);
    console.log(
      `     • Muhammed Abiodun (BU22CSC1005) - muhammedabiodun42@gmail.com`
    );
    console.log(`     • Mustapha Muhammed - Mustapha.muhammed@bowen.edu.ng`);
    console.log(`   - Total students created: 86 (2 per department)`);
    console.log(`   - Default password for all students: 1234`);
    console.log(`   - All students must change password on first login`);
    console.log("\n🚀 You can now start the server with: npm start");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Database connection closed");
    process.exit(0);
  }
}

// Run seed
seed();
