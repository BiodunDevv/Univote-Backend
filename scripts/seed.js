require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Student = require("../src/models/Student");
const Admin = require("../src/models/Admin");
const College = require("../src/models/College");
const VotingSession = require("../src/models/VotingSession");
const Candidate = require("../src/models/Candidate");
const Vote = require("../src/models/Vote");
const AuditLog = require("../src/models/AuditLog");

// Services
const faceppService = require("../src/services/faceppService");

// Cloudinary image URL for student photos
const STUDENT_PHOTO_URL =
  "https://res.cloudinary.com/df4f0usnh/image/upload/v1761725926/univote/candidates/isxi22irk87hyzglhl0s.jpg";

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

// Academic staff names for Deans and HODs
const deanNames = [
  {
    name: "Prof. Adeyemi Olanrewaju",
    email: "a.olanrewaju@bowenuniversity.edu.ng",
  },
  { name: "Prof. Chioma Nwosu", email: "c.nwosu@bowenuniversity.edu.ng" },
  {
    name: "Prof. Ibrahim Suleiman",
    email: "i.suleiman@bowenuniversity.edu.ng",
  },
  { name: "Prof. Grace Adebisi", email: "g.adebisi@bowenuniversity.edu.ng" },
  { name: "Prof. Oluwaseun Bakare", email: "o.bakare@bowenuniversity.edu.ng" },
  {
    name: "Prof. Funmilayo Ogundele",
    email: "f.ogundele@bowenuniversity.edu.ng",
  },
  { name: "Prof. Mohammed Aliyu", email: "m.aliyu@bowenuniversity.edu.ng" },
];

const hodNames = [
  { name: "Dr. Adebayo Johnson", email: "a.johnson@bowenuniversity.edu.ng" },
  { name: "Dr. Chinwe Okafor", email: "c.okafor@bowenuniversity.edu.ng" },
  { name: "Dr. Emmanuel Adeleke", email: "e.adeleke@bowenuniversity.edu.ng" },
  { name: "Dr. Fatima Abubakar", email: "f.abubakar@bowenuniversity.edu.ng" },
  { name: "Dr. Ibrahim Yusuf", email: "i.yusuf@bowenuniversity.edu.ng" },
  { name: "Dr. Jennifer Okoro", email: "j.okoro@bowenuniversity.edu.ng" },
  { name: "Dr. Kunle Ogunleye", email: "k.ogunleye@bowenuniversity.edu.ng" },
  { name: "Dr. Loveth Nnamdi", email: "l.nnamdi@bowenuniversity.edu.ng" },
  { name: "Dr. Muhammad Hassan", email: "m.hassan@bowenuniversity.edu.ng" },
  { name: "Dr. Ngozi Eze", email: "n.eze@bowenuniversity.edu.ng" },
  { name: "Dr. Oluwatobi Adeyemi", email: "o.adeyemi@bowenuniversity.edu.ng" },
  { name: "Dr. Peace Okonkwo", email: "p.okonkwo@bowenuniversity.edu.ng" },
  { name: "Dr. Samuel Adewale", email: "s.adewale@bowenuniversity.edu.ng" },
  { name: "Dr. Temitope Olaniyi", email: "t.olaniyi@bowenuniversity.edu.ng" },
  { name: "Dr. Uche Nwankwo", email: "u.nwankwo@bowenuniversity.edu.ng" },
  { name: "Dr. Victoria Obi", email: "v.obi@bowenuniversity.edu.ng" },
  { name: "Dr. Williams Akande", email: "w.akande@bowenuniversity.edu.ng" },
  { name: "Dr. Yetunde Balogun", email: "y.balogun@bowenuniversity.edu.ng" },
  { name: "Dr. Zainab Ahmed", email: "z.ahmed@bowenuniversity.edu.ng" },
  { name: "Dr. Blessing Okoli", email: "b.okoli@bowenuniversity.edu.ng" },
  { name: "Dr. Chinedu Onyema", email: "c.onyema@bowenuniversity.edu.ng" },
  { name: "Dr. Daniel Oladele", email: "d.oladele@bowenuniversity.edu.ng" },
  { name: "Dr. Esther Ogunbiyi", email: "e.ogunbiyi@bowenuniversity.edu.ng" },
  { name: "Dr. Felix Adekunle", email: "f.adekunle@bowenuniversity.edu.ng" },
  { name: "Dr. Grace Olayinka", email: "g.olayinka@bowenuniversity.edu.ng" },
  { name: "Dr. Hassan Bello", email: "h.bello@bowenuniversity.edu.ng" },
  { name: "Dr. Ifeoma Chukwuma", email: "i.chukwuma@bowenuniversity.edu.ng" },
  { name: "Dr. Joshua Idowu", email: "j.idowu@bowenuniversity.edu.ng" },
  { name: "Dr. Kemi Afolabi", email: "k.afolabi@bowenuniversity.edu.ng" },
  { name: "Dr. Lateef Abdullahi", email: "l.abdullahi@bowenuniversity.edu.ng" },
  { name: "Dr. Mercy Udoh", email: "m.udoh@bowenuniversity.edu.ng" },
  { name: "Dr. Nathaniel Okafor", email: "n.okafor@bowenuniversity.edu.ng" },
  { name: "Dr. Onyeka Ezeh", email: "o.ezeh@bowenuniversity.edu.ng" },
  { name: "Dr. Peter Ogundipe", email: "p.ogundipe@bowenuniversity.edu.ng" },
  { name: "Dr. Queen Onyeji", email: "q.onyeji@bowenuniversity.edu.ng" },
  { name: "Dr. Rachel Adeniyi", email: "r.adeniyi@bowenuniversity.edu.ng" },
  { name: "Dr. Stephen Ogunlana", email: "s.ogunlana@bowenuniversity.edu.ng" },
  { name: "Dr. Tunde Olawale", email: "t.olawale@bowenuniversity.edu.ng" },
  { name: "Dr. Uzoma Iwuoha", email: "u.iwuoha@bowenuniversity.edu.ng" },
  { name: "Dr. Vincent Adegoke", email: "v.adegoke@bowenuniversity.edu.ng" },
  { name: "Dr. Wuraola Adesina", email: "w.adesina@bowenuniversity.edu.ng" },
  { name: "Dr. Xavier Okonkwo", email: "x.okonkwo@bowenuniversity.edu.ng" },
  { name: "Dr. Yemi Oluwaseun", email: "y.oluwaseun@bowenuniversity.edu.ng" },
];

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
  await College.deleteMany({});
  await VotingSession.deleteMany({});
  await Candidate.deleteMany({});
  await Vote.deleteMany({});
  await AuditLog.deleteMany({});

  console.log("✅ Database cleared");
}

/**
 * Create colleges and departments
 */
async function seedColleges() {
  console.log("\n🏛️  Creating colleges and departments...");

  const collegeDocuments = [];
  let hodIndex = 0; // Track HOD assignment
  let deanIndex = 0; // Track Dean assignment

  for (const [collegeName, collegeInfo] of Object.entries(
    collegesAndDepartments
  )) {
    const departments = [];

    for (const [deptName, deptCode] of Object.entries(
      collegeInfo.departments
    )) {
      // Determine available levels based on department
      let availableLevels = ["100", "200", "300", "400"];

      // Medicine, Law, Architecture typically have more years
      if (
        deptName.includes("Medicine") ||
        deptName.includes("MBBS") ||
        deptName.includes("Law") ||
        deptName.includes("Architecture")
      ) {
        availableLevels = ["100", "200", "300", "400", "500", "600"];
      } else if (
        (deptName.includes("Engineering") &&
          !deptName.includes("Software Engineering")) ||
        deptName.includes("Pharmacy")
      ) {
        availableLevels = ["100", "200", "300", "400", "500"];
      }
      // Software Engineering stays at 4 years (default)

      // Assign HOD to department
      const hod = hodNames[hodIndex % hodNames.length];
      hodIndex++;

      departments.push({
        name: deptName,
        code: deptCode,
        description: `Department of ${deptName}`,
        hod_name: hod.name,
        hod_email: hod.email,
        available_levels: availableLevels,
        is_active: true,
      });
    }

    // Assign Dean to college
    const dean = deanNames[deanIndex % deanNames.length];
    deanIndex++;

    collegeDocuments.push({
      name: collegeName,
      code: collegeInfo.code,
      description: `${collegeName} at Bowen University`,
      dean_name: dean.name,
      dean_email: dean.email,
      departments: departments,
      is_active: true,
    });
  }

  await College.insertMany(collegeDocuments);

  console.log(
    `✅ Created ${collegeDocuments.length} colleges with departments`
  );

  // Log summary with Dean and HOD info
  for (const college of collegeDocuments) {
    console.log(
      `   - ${college.name} (${college.code}): ${college.departments.length} departments`
    );
    console.log(`     Dean: ${college.dean_name}`);
  }
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
    full_name: "Biodun Administrator",
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
  const levels = ["100", "200", "300", "400", "500", "600"];
  let facesRegistered = 0;
  let facesFailed = 0;

  // Track department counters for unique matric numbers per department
  const departmentCounters = {};
  let isFirstComputerScienceStudent = true;
  let isFirstAccountingStudent = true;

  // Fetch all colleges with departments to get available_levels
  const colleges = await College.find({});
  const departmentLevelsMap = {};

  // Build a map of department code to available levels
  colleges.forEach((college) => {
    college.departments.forEach((dept) => {
      departmentLevelsMap[dept.code] = dept.available_levels || [
        "100",
        "200",
        "300",
        "400",
      ];
    });
  });

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

      // Get available levels for this department
      const departmentAvailableLevels = departmentLevelsMap[deptCode] || levels;

      // Create exactly 1 student per department
      for (let i = 0; i < 1; i++) {
        departmentCounters[deptCode]++;

        // Default values
        let firstName = randomElement(firstNames);
        let lastName = randomElement(lastNames);
        let level = randomElement(departmentAvailableLevels); // Use department-specific levels
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
          // Ensure level is valid for this department
          level = departmentAvailableLevels.includes("400")
            ? "400"
            : randomElement(departmentAvailableLevels);
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
          level = randomElement(departmentAvailableLevels); // Use department-specific levels
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
          photo_url: STUDENT_PHOTO_URL,
          face_token: null, // Will be populated after Face++ detection
        };

        students.push(student);
      }
    }
  }

  console.log(`\n🎭 Registering student faces with Face++...`);

  // Register faces for all students
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    try {
      const faceResult = await faceppService.detectFace(student.photo_url);
      student.face_token = faceResult.face_token;
      facesRegistered++;

      // Show progress every 10 students
      if ((i + 1) % 10 === 0) {
        console.log(
          `   Progress: ${i + 1}/${students.length} faces registered...`
        );
      }
    } catch (error) {
      console.warn(
        `   ⚠️  Failed to register face for ${student.full_name}: ${error.message}`
      );
      facesFailed++;
      // Continue without face_token - student can still be created
    }
  }

  console.log(
    `✅ Face registration complete: ${facesRegistered} successful, ${facesFailed} failed`
  );

  // Insert all students
  const insertedStudents = await Student.insertMany(students);

  console.log(`✅ Generated ${insertedStudents.length} students`);
  console.log(
    `   🎭 Face++ registration: ${facesRegistered} faces registered successfully`
  );
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

  return { students: insertedStudents, facesRegistered, facesFailed };
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
    await seedColleges();
    await createAdmin();
    const studentResult = await generateStudents();

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
    console.log(
      `   - Total students created: ${studentResult.students.length}`
    );
    console.log(
      `   - Face++ registration: ${studentResult.facesRegistered} students with facial data`
    );
    if (studentResult.facesFailed > 0) {
      console.log(
        `   - Face++ failures: ${studentResult.facesFailed} students without facial data`
      );
    }
    console.log(`   - Default password for all students: 1234`);
    console.log(`   - All students must change password on first login`);
    console.log(`   - Matric format: BU{Year}{DeptCode}{Number}`);
    console.log(
      `     Example: BU22CSC0001 = 2022, Computer Science, Student #1`
    );
    console.log("\n🚀 You can now start the server with: npm start");
    console.log(
      "🎭 Face++ facial verification enabled for voting (80% confidence threshold)"
    );
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
