require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Student = require("../src/models/Student");
const Admin = require("../src/models/Admin");
const VotingSession = require("../src/models/VotingSession");
const Candidate = require("../src/models/Candidate");
const Vote = require("../src/models/Vote");
const AuditLog = require("../src/models/AuditLog");

// College and Department mappings (Bowen University) with department codes
const collegesAndDepartments = {
  "College of Agriculture, Engineering and Science": {
    code: "COAES",
    departments: {
      Microbiology: "MIC",
      "Pure & Applied Biology": "BIO",
      Biochemistry: "BCH",
      "Industrial Chemistry": "CHM",
      Mathematics: "MTH",
      Statistics: "STA",
      Physics: "PHY",
      "Bachelor of Agriculture (B.Agric.)": "AGR",
      "Food Science and Technology": "FST",
      "Electrical/Electronics Engineering": "EEE",
      "Mechatronics Engineering": "MCT",
      "Agricultural Extension & Rural Development": "AER",
    },
  },
  "College of Management and Social Sciences": {
    code: "COMSS",
    departments: {
      Accounting: "ACC",
      "Banking and Finance": "BNF",
      "Business Administration": "BUS",
      "Industrial Relations & Personnel Management": "IRP",
      Economics: "ECO",
      Sociology: "SOC",
      "Political Science": "POL",
      "International Relations": "INT",
      "Political and Law": "PAL",
    },
  },
  "College of Law": {
    code: "COLAW",
    departments: {
      "Law (LL.B.)": "LAW",
    },
  },
  "College of Liberal Studies": {
    code: "COLBS",
    departments: {
      Music: "MUS",
      "Theatre Arts": "THA",
      English: "ENG",
      "History & International Studies": "HIS",
      "Religious Studies": "REL",
    },
  },
  "College of Health Sciences": {
    code: "COHES",
    departments: {
      Anatomy: "ANA",
      Physiology: "PHS",
      "Medicine & Surgery (MBBS)": "MED",
      "Nursing Science": "NUR",
      Physiotherapy: "PHT",
      "Public Health": "PHU",
      "Medical Laboratory Science (BMLS)": "MLS",
      "Nutrition & Dietetics": "NUT",
    },
  },
  "College of Computing and Communication Studies": {
    code: "COCCS",
    departments: {
      "Computer Science": "CSC",
      "Mass Communication": "MAS",
      "Communication Arts": "CMA",
      "Cyber Security": "CYB",
      "Software Engineering": "SEN",
      "Information Technology": "IFT",
    },
  },
  "College of Environmental Sciences": {
    code: "COEVS",
    departments: {
      Architecture: "ARC",
    },
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
 * Generate matric number in BU format with department code
 * Format: BU{YY}{DEPT_CODE}{NUMBER}
 * Example: BU22CSC1005 (Computer Science), BU22ACC2001 (Accounting)
 */
function generateMatricNo(year, deptCode, index) {
  const yearCode = year.toString().slice(-2);
  const studentNumber = String(index).padStart(4, "0");
  return `BU${yearCode}${deptCode}${studentNumber}`;
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

  // Track department counters for unique matric numbers per department
  const departmentCounters = {};
  let isFirstComputerScienceStudent = true;
  let isFirstAccountingStudent = true;

  for (const [collegeName, collegeInfo] of Object.entries(
    collegesAndDepartments
  )) {
    const collegeCode = collegeInfo.code;

    for (const [departmentName, deptCode] of Object.entries(
      collegeInfo.departments
    )) {
      // Initialize counter for this department
      if (!departmentCounters[deptCode]) {
        departmentCounters[deptCode] = 0;
      }

      // Create exactly 2 students per department
      for (let i = 0; i < 2; i++) {
        departmentCounters[deptCode]++;

        // Default values
        let firstName = randomElement(firstNames);
        let lastName = randomElement(lastNames);
        let level = randomElement(levels);
        let enrollmentYear = 2022;
        let matricNo = generateMatricNo(
          enrollmentYear,
          deptCode,
          departmentCounters[deptCode]
        );
        let email = generateEmail(firstName, lastName, matricNo);

        // Special case 1: First student in Computer Science department (COCCS)
        if (
          departmentName === "Computer Science" &&
          deptCode === "CSC" &&
          isFirstComputerScienceStudent
        ) {
          firstName = "Muhammed";
          lastName = "Abiodun";
          matricNo = "BU22CSC1005";
          email = "muhammedabiodun42@gmail.com";
          level = "400";
          isFirstComputerScienceStudent = false;
          console.log(
            `   🎯 Creating special student: ${firstName} ${lastName} - ${matricNo} (${email})`
          );
        }
        // Special case 2: First student in Accounting (COMSS)
        else if (deptCode === "ACC" && isFirstAccountingStudent) {
          firstName = "Mustapha";
          lastName = "Muhammed";
          email = "Mustapha.muhammed@bowen.edu.ng";
          level = randomElement(levels);
          isFirstAccountingStudent = false;
          console.log(
            `   🎯 Creating special student: ${firstName} ${lastName} - ${matricNo} (${email})`
          );
        }

        const student = {
          matric_no: matricNo,
          full_name: `${firstName} ${lastName}`,
          email: email,
          password_hash: defaultPasswordHash,
          department: departmentName,
          department_code: deptCode,
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
  console.log(`\n   Sample Matric Numbers by Department:`);

  // Show some examples
  const examples = [
    { dept: "Computer Science", code: "CSC", matric: "BU22CSC0001" },
    { dept: "Accounting", code: "ACC", matric: "BU22ACC0001" },
    { dept: "Law", code: "LAW", matric: "BU22LAW0001" },
    { dept: "Medicine & Surgery", code: "MED", matric: "BU22MED0001" },
  ];

  examples.forEach((ex) => {
    console.log(`   - ${ex.dept} (${ex.code}): ${ex.matric}`);
  });

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
    console.log(
      `     • Mustapha Muhammed (BU22ACC0002) - Mustapha.muhammed@bowen.edu.ng`
    );
    console.log(`   - Total students created: 86 (2 per department)`);
    console.log(`   - Default password for all students: 1234`);
    console.log(`   - All students must change password on first login`);
    console.log(`   - Matric format: BU{Year}{DeptCode}{Number}`);
    console.log(
      `     Example: BU22CSC0001 = 2022, Computer Science, Student #1`
    );
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
