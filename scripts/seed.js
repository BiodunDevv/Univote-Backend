require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Student = require("../src/models/Student");
const Admin = require("../src/models/Admin");
const Tenant = require("../src/models/Tenant");
const TenantAdminMembership = require("../src/models/TenantAdminMembership");
const College = require("../src/models/College");
const VotingSession = require("../src/models/VotingSession");
const Candidate = require("../src/models/Candidate");
const Vote = require("../src/models/Vote");
const VerificationLog = require("../src/models/VerificationLog");
const AuditLog = require("../src/models/AuditLog");
const Notification = require("../src/models/Notification");
const Testimonial = require("../src/models/Testimonial");
const PlatformSetting = require("../src/models/PlatformSetting");
const Announcement = require("../src/models/Announcement");
const { cloneDefaultTenantSettings } = require("../src/utils/tenantSettings");
const faceppService = require("../src/services/faceppService");

const DEFAULT_PASSWORD = "123456789";
const DEPLOY_ROOT_DOMAIN = String(
  process.env.SEED_ROOT_DOMAIN ||
    process.env.APP_ROOT_DOMAIN ||
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
    "univote.online",
)
  .trim()
  .toLowerCase()
  .replace(/^\./, "");
const SUPER_ADMIN_EMAIL = "super@gmail.com";
const TENANT_ADMIN_EMAIL = "tenant@gmail.com";
const SECONDARY_TENANT_ADMIN_EMAIL = "tenant2@gmail.com";
const PRIMARY_TENANT_OPS_ADMIN_EMAIL = "ops.bowen@gmail.com";
const SECONDARY_TENANT_SUPPORT_ADMIN_EMAIL = "support.summit@gmail.com";
const TENANT_SLUG = "bowen-demo";
const SECONDARY_TENANT_SLUG = "summit-demo";
const SEEDED_FACEPP_KEY = process.env.FACEPP_API_KEY || null;
const SEEDED_FACEPP_SECRET = process.env.FACEPP_API_SECRET || null;
const SEEDED_FACEPP_BASE_URL =
  process.env.FACEPP_BASE_URL || "https://api-us.faceplusplus.com/facepp/v3";
const SEEDED_FACEPP_THRESHOLD = Number(
  process.env.FACE_CONFIDENCE_THRESHOLD || 80,
);

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Cloudinary image URL for student photos
const STUDENT_PHOTO_URL =
  "https://res.cloudinary.com/df4f0usnh/image/upload/v1761725926/univote/candidates/isxi22irk87hyzglhl0s.jpg";

function buildSeedTenantDomain(slug) {
  return `${slug}.${DEPLOY_ROOT_DOMAIN}`;
}

function buildApplicationReference(label) {
  return `APP-${label}`;
}

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

const summitCollegesAndDepartments = {
  "College of Computing and Digital Innovation": {
    code: "CCDI",
    departments: {
      "Computer Science": "CSC",
      "Software Engineering": "SWE",
      "Cyber Security": "CYB",
      "Data Science": "DTS",
      "Information Systems": "IFS",
    },
  },
  "College of Business and Policy Studies": {
    code: "CBPS",
    departments: {
      Accounting: "ACC",
      Economics: "ECO",
      "Business Administration": "BUS",
      "Public Policy": "PPL",
      "International Relations": "INT",
    },
  },
  "College of Allied Health Sciences": {
    code: "CAHS",
    departments: {
      "Nursing Science": "NUR",
      "Medical Laboratory Science": "MLS",
      Physiotherapy: "PHT",
      "Public Health": "PHU",
    },
  },
  "College of Built and Environmental Sciences": {
    code: "CBES",
    departments: {
      Architecture: "ARC",
      "Quantity Surveying": "QTS",
      "Urban and Regional Planning": "URP",
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
function generateMatricNo(year, deptCode, index, prefix = "BU") {
  const yearCode = year.toString().slice(-2);
  const studentNumber = String(index).padStart(4, "0");
  return `${prefix}${yearCode}${deptCode}${studentNumber}`;
}

/**
 * Generate random email
 */
function generateEmail(firstName, lastName, matric, domain) {
  const cleanFirst = firstName.toLowerCase().replace(/\s/g, "");
  const cleanLast = lastName.toLowerCase().replace(/\s/g, "");
  return `${cleanFirst}.${cleanLast}@${domain}`;
}

/**
 * Get random element from array
 */
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTenantAcademicProfile(tenant) {
  if (tenant.slug === SECONDARY_TENANT_SLUG) {
    return {
      institutionName: "Summit University",
      collegesMap: summitCollegesAndDepartments,
      matricPrefix: "SU",
      studentEmailDomain: "student.summituniversity.edu.ng",
    };
  }

  return {
    institutionName: "Bowen University",
    collegesMap: collegesAndDepartments,
    matricPrefix: "BU",
    studentEmailDomain: "student.bowenuniversity.edu.ng",
  };
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

async function clearDatabase() {
  console.log("\n🗑️  Dropping database...");
  await mongoose.connection.db.dropDatabase();
  console.log("✅ Database cleared");
}

async function createPasswordHash(password = DEFAULT_PASSWORD) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

function buildDepartments(collegesMap, institutionName) {
  const departmentsByCollege = [];
  let hodIndex = 0;
  let deanIndex = 0;

  for (const [collegeName, collegeInfo] of Object.entries(collegesMap)) {
    const dean = deanNames[deanIndex % deanNames.length];
    deanIndex += 1;

    const departments = Object.entries(collegeInfo.departments).map(
      ([departmentName, departmentCode]) => {
        const hod = hodNames[hodIndex % hodNames.length];
        hodIndex += 1;

        let availableLevels = ["100", "200", "300", "400"];
        if (
          departmentName.includes("Medicine") ||
          departmentName.includes("MBBS") ||
          departmentName.includes("Law") ||
          departmentName.includes("Architecture")
        ) {
          availableLevels = ["100", "200", "300", "400", "500", "600"];
        } else if (
          (departmentName.includes("Engineering") &&
            !departmentName.includes("Software Engineering")) ||
          departmentName.includes("Pharmacy")
        ) {
          availableLevels = ["100", "200", "300", "400", "500"];
        }

        return {
          name: departmentName,
          code: departmentCode,
          description: `Department of ${departmentName}`,
          hod_name: hod.name,
          hod_email: hod.email,
          available_levels: availableLevels,
          is_active: true,
        };
      },
    );

    departmentsByCollege.push({
      name: collegeName,
      code: collegeInfo.code,
      description: `${collegeName} at ${institutionName}`,
      dean_name: dean.name,
      dean_email: dean.email,
      departments,
      is_active: true,
    });
  }

  return departmentsByCollege;
}

async function createPlatformAccounts() {
  console.log("\n👤 Creating platform accounts...");

  const passwordHash = await createPasswordHash();

  const [
    superAdmin,
    tenantAdmin,
    secondaryTenantAdmin,
    primaryTenantOpsAdmin,
    secondaryTenantSupportAdmin,
  ] = await Admin.create([
    {
      email: SUPER_ADMIN_EMAIL,
      password_hash: passwordHash,
      full_name: "Univote Super Admin",
      role: "super_admin",
      is_active: true,
    },
    {
      email: TENANT_ADMIN_EMAIL,
      password_hash: passwordHash,
      full_name: "Multi-Organization Tenant Owner",
      role: "admin",
      is_active: true,
    },
    {
      email: SECONDARY_TENANT_ADMIN_EMAIL,
      password_hash: passwordHash,
      full_name: "Summit Workspace Owner",
      role: "admin",
      is_active: true,
    },
    {
      email: PRIMARY_TENANT_OPS_ADMIN_EMAIL,
      password_hash: passwordHash,
      full_name: "Bowen Operations Admin",
      role: "admin",
      is_active: true,
    },
    {
      email: SECONDARY_TENANT_SUPPORT_ADMIN_EMAIL,
      password_hash: passwordHash,
      full_name: "Summit Support Admin",
      role: "admin",
      is_active: true,
    },
  ]);

  console.log(`✅ Super admin: ${SUPER_ADMIN_EMAIL}`);
  console.log(`✅ Tenant admin: ${TENANT_ADMIN_EMAIL}`);
  console.log(`✅ Tenant admin: ${SECONDARY_TENANT_ADMIN_EMAIL}`);
  console.log(`✅ Tenant admin: ${PRIMARY_TENANT_OPS_ADMIN_EMAIL}`);
  console.log(`✅ Tenant admin: ${SECONDARY_TENANT_SUPPORT_ADMIN_EMAIL}`);

  return {
    superAdmin,
    tenantAdmin,
    secondaryTenantAdmin,
    primaryTenantOpsAdmin,
    secondaryTenantSupportAdmin,
  };
}

async function seedPlatformDefaults() {
  console.log("\n⚙️  Seeding platform defaults...");

  await PlatformSetting.create({
    key: "defaults",
    defaults: cloneDefaultTenantSettings(),
    biometrics: {
      active_provider: "facepp",
      providers: {
        facepp: {
          enabled: true,
          api_key: SEEDED_FACEPP_KEY,
          api_secret: SEEDED_FACEPP_SECRET,
          base_url: SEEDED_FACEPP_BASE_URL,
          confidence_threshold: SEEDED_FACEPP_THRESHOLD,
        },
        aws_rekognition: {
          enabled: false,
          region: "us-east-1",
          access_key_id: null,
          secret_access_key: null,
          similarity_threshold: 90,
        },
        azure_face: {
          enabled: false,
          endpoint: null,
          api_key: null,
          confidence_threshold: 80,
        },
        google_vision: {
          enabled: false,
          project_id: null,
          api_key: null,
          confidence_threshold: 80,
        },
      },
    },
  });

  console.log(
    `✅ Platform defaults seeded (Face++ ${SEEDED_FACEPP_KEY && SEEDED_FACEPP_SECRET ? "configured from env" : "left unconfigured for secure setup"})`,
  );
}

async function createActiveDemoTenants(
  primaryTenantAdminId,
  secondaryTenantAdminId,
  primaryTenantOpsAdminId,
  secondaryTenantSupportAdminId,
) {
  console.log("\n🏢 Creating active demo tenants...");

  const now = new Date();

  const [primaryTenant, secondaryTenant] = await Tenant.create([
    {
      name: "Bowen University Demo",
      slug: TENANT_SLUG,
      application_reference: buildApplicationReference("20260315-BOWE01"),
      primary_domain: buildSeedTenantDomain(TENANT_SLUG),
      status: "active",
      is_active: true,
      branding: {
        primary_color: "#0f172a",
        accent_color: "#1d4ed8",
        support_email: "support@bowen-demo.edu.ng",
      },
      settings: {
        ...cloneDefaultTenantSettings(),
        auth: {
          require_email: true,
          require_photo: false,
          require_face_verification: false,
        },
        features: {
          custom_terminology: true,
          custom_identity_policy: true,
          custom_participant_structure: true,
          advanced_notifications: true,
          advanced_reports: true,
          face_verification: true,
        },
      },
      onboarding: {
        contact_name: "Bowen Tenant Owner",
        contact_email: TENANT_ADMIN_EMAIL,
        contact_phone: "+2348000000001",
        institution_type: "university",
        student_count_estimate: 7500,
        admin_count_estimate: 8,
        notes: "Primary demo tenant seeded for tenant admin acceptance flows.",
        demo_requested: false,
        application_submitted_at: now,
        application_last_updated_at: now,
        activated_at: now,
        approved_at: now,
        status_timeline: [
          {
            status: "approved",
            label: "Demo tenant provisioned",
            note: "Pre-activated workspace for demo and QA flows.",
            at: now,
          },
        ],
      },
    },
    {
      name: "Summit University Demo",
      slug: SECONDARY_TENANT_SLUG,
      application_reference: buildApplicationReference("20260315-SUMM01"),
      primary_domain: buildSeedTenantDomain(SECONDARY_TENANT_SLUG),
      status: "active",
      is_active: true,
      branding: {
        primary_color: "#14532d",
        accent_color: "#16a34a",
        support_email: "support@summit-demo.edu.ng",
      },
      settings: {
        ...cloneDefaultTenantSettings(),
        labels: {
          participant_singular: "Member",
          participant_plural: "Members",
        },
        identity: {
          primary_identifier: "member_id",
          allowed_identifiers: ["member_id"],
          recovery_identifiers: ["email"],
          display_identifier: "member_id",
        },
        auth: {
          require_email: true,
          require_photo: true,
          require_face_verification: true,
        },
        features: {
          custom_terminology: true,
          custom_identity_policy: true,
          custom_participant_structure: true,
          advanced_notifications: false,
          advanced_reports: false,
          face_verification: true,
        },
        participant_fields: {
          full_name: {
            enabled: true,
            required: true,
            show_in_profile: true,
            show_in_filters: false,
            allow_in_eligibility: false,
          },
          email: {
            enabled: true,
            required: true,
            show_in_profile: true,
            show_in_filters: false,
            allow_in_eligibility: false,
          },
          matric_no: {
            enabled: false,
            required: false,
            show_in_profile: false,
            show_in_filters: false,
            allow_in_eligibility: false,
          },
          member_id: {
            enabled: true,
            required: true,
            show_in_profile: true,
            show_in_filters: true,
            allow_in_eligibility: false,
          },
          employee_id: {
            enabled: false,
            required: false,
            show_in_profile: false,
            show_in_filters: false,
            allow_in_eligibility: false,
          },
          username: {
            enabled: true,
            required: false,
            show_in_profile: true,
            show_in_filters: false,
            allow_in_eligibility: false,
          },
          college: {
            enabled: true,
            required: true,
            show_in_profile: true,
            show_in_filters: true,
            allow_in_eligibility: true,
          },
          department: {
            enabled: true,
            required: true,
            show_in_profile: true,
            show_in_filters: true,
            allow_in_eligibility: true,
          },
          level: {
            enabled: true,
            required: true,
            show_in_profile: true,
            show_in_filters: true,
            allow_in_eligibility: true,
          },
          photo_url: {
            enabled: true,
            required: false,
            show_in_profile: true,
            show_in_filters: false,
            allow_in_eligibility: false,
          },
          face_verification: {
            enabled: true,
            required: true,
            show_in_profile: false,
            show_in_filters: true,
            allow_in_eligibility: false,
          },
        },
      },
      onboarding: {
        contact_name: "Summit Tenant Owner",
        contact_email: SECONDARY_TENANT_ADMIN_EMAIL,
        contact_phone: "+2348000000004",
        institution_type: "university",
        student_count_estimate: 2800,
        admin_count_estimate: 5,
        notes:
          "Secondary active tenant for university workflow verification.",
        demo_requested: false,
        application_submitted_at: addDays(now, -10),
        application_last_updated_at: addDays(now, -7),
        activated_at: addDays(now, -7),
        approved_at: addDays(now, -8),
        status_timeline: [
          {
            status: "approved",
            label: "Demo tenant provisioned",
            note: "Pre-activated flat participant workspace for switch testing.",
            at: addDays(now, -8),
          },
        ],
      },
    },
  ]);

  await TenantAdminMembership.insertMany([
    {
      tenant_id: primaryTenant._id,
      admin_id: primaryTenantAdminId,
      role: "owner",
      permissions: [
        "tenant.manage",
        "tenant.settings.manage",
        "tenant.identity.manage",
        "tenant.labels.manage",
        "tenant.auth-policy.manage",
        "tenant.roles.manage",
        "students.manage",
        "participants.manage",
        "participants.view",
        "sessions.manage",
        "support.manage",
        "analytics.view",
        "reports.export",
      ],
      is_active: true,
    },
    {
      tenant_id: secondaryTenant._id,
      admin_id: secondaryTenantAdminId,
      role: "owner",
      permissions: [
        "tenant.manage",
        "tenant.settings.manage",
        "tenant.identity.manage",
        "tenant.labels.manage",
        "tenant.auth-policy.manage",
        "tenant.roles.manage",
        "students.manage",
        "participants.manage",
        "participants.view",
        "sessions.manage",
        "support.manage",
        "analytics.view",
        "reports.export",
      ],
      is_active: true,
    },
    {
      tenant_id: primaryTenant._id,
      admin_id: primaryTenantOpsAdminId,
      role: "admin",
      permissions: [
        "participants.view",
        "participants.manage",
        "students.manage",
        "sessions.manage",
        "analytics.view",
        "reports.export",
      ],
      is_active: true,
    },
    {
      tenant_id: secondaryTenant._id,
      admin_id: secondaryTenantSupportAdminId,
      role: "support",
      permissions: ["participants.view", "support.manage", "analytics.view"],
      is_active: true,
    },
  ]);

  console.log(
    `✅ Active demo tenants created: ${primaryTenant.slug}, ${secondaryTenant.slug}`,
  );

  return { primaryTenant, secondaryTenant };
}

async function createPipelineTenants() {
  console.log("\n🧾 Creating onboarding pipeline tenants...");

  const now = new Date();
  const tenants = await Tenant.insertMany([
    {
      name: "Lakeside University",
      slug: "lakeside-university",
      application_reference: buildApplicationReference("20260315-LAKE01"),
      primary_domain: buildSeedTenantDomain("lakeside"),
      status: "pending_approval",
      is_active: true,
      onboarding: {
        contact_name: "Miriam Afolayan",
        contact_email: "miriam@lakesidepoly.edu.ng",
        contact_phone: "+2348000000002",
        institution_type: "university",
        student_count_estimate: 3200,
        admin_count_estimate: 4,
        notes: "Needs a quick demo before final platform approval.",
        demo_requested: true,
        application_submitted_at: now,
        application_last_updated_at: now,
        status_timeline: [
          {
            status: "draft",
            label: "Application draft started",
            note: "Saved from public application form.",
            at: addDays(now, -1),
          },
          {
            status: "pending_approval",
            label: "Submitted for platform review",
            note: "Application submitted and queued for moderation.",
            at: now,
          },
        ],
      },
    },
    {
      name: "Northfield University",
      slug: "northfield-university",
      application_reference: buildApplicationReference("20260315-NORT01"),
      primary_domain: buildSeedTenantDomain("northfield"),
      status: "pending_approval",
      is_active: true,
      onboarding: {
        contact_name: "Daniel Oriji",
        contact_email: "daniel@northfieldcollege.edu.ng",
        contact_phone: "+2348000000003",
        institution_type: "university",
        student_count_estimate: 18000,
        admin_count_estimate: 18,
        notes:
          "Application submitted, waiting on platform review and provisioning.",
        demo_requested: false,
        application_submitted_at: addDays(now, -3),
        application_last_updated_at: addDays(now, -1),
        approved_at: null,
        status_timeline: [
          {
            status: "draft",
            label: "Application draft started",
            note: "Enterprise application prepared by applicant.",
            at: addDays(now, -5),
          },
          {
            status: "pending_approval",
            label: "Ready for platform approval",
            note: "Application is queued for platform review.",
            at: addDays(now, -3),
          },
        ],
      },
    },
  ]);

  console.log(`✅ Created ${tenants.length} onboarding pipeline tenants`);

  return tenants;
}

async function seedTenantColleges(tenant, tenantAdminId) {
  console.log("\n🏛️  Creating colleges and departments for tenant...");
  const { collegesMap, institutionName } = getTenantAcademicProfile(tenant);

  const collegeDocuments = buildDepartments(collegesMap, institutionName).map(
    (college) => ({
      ...college,
      tenant_id: tenant._id,
      created_by: tenantAdminId,
    }),
  );

  const colleges = await College.insertMany(collegeDocuments);
  console.log(`✅ Created ${colleges.length} colleges`);
  return colleges;
}

async function seedTenantStudents(tenant, colleges) {
  console.log("\n👨‍🎓 Generating tenant students...");
  const passwordHash = await createPasswordHash();
  const students = [];

  if (tenant.slug === TENANT_SLUG) {
    const computerScienceCollege = colleges.find((college) =>
      college.departments.some((department) => department.code === "CSC"),
    );
    const computerScienceDepartment = computerScienceCollege?.departments.find(
      (department) => department.code === "CSC",
    );

    if (computerScienceCollege && computerScienceDepartment) {
      students.push({
        tenant_id: tenant._id,
        matric_no: "BU22CSC1005",
        member_id: null,
        employee_id: null,
        username: null,
        full_name: "Muhammed Abiodun",
        email: "muhammedabiodun42@gmail.com",
        password_hash: passwordHash,
        first_login: false,
        department: computerScienceDepartment.name,
        department_code: computerScienceDepartment.code,
        college: computerScienceCollege.name,
        level: "400",
        has_voted_sessions: [],
        photo_url: STUDENT_PHOTO_URL,
        photo_review_status: "approved",
        face_token: null,
        is_logged_in: false,
        is_active: true,
      });
    }
  }

  const insertedStudents = await Student.insertMany(students);
  console.log(`✅ Created ${insertedStudents.length} tenant students`);
  return insertedStudents;
}

function isFaceppConfiguredForSeed() {
  return Boolean(SEEDED_FACEPP_KEY && SEEDED_FACEPP_SECRET);
}

async function enrollSeedStudentFaces(students) {
  if (!isFaceppConfiguredForSeed()) {
    console.log(
      "ℹ️  Face++ credentials not available during seed. Student facial enrollment skipped.",
    );
    return {
      enrolled: 0,
      skipped: students.length,
      failed: 0,
    };
  }

  faceppService.configure({
    api_key: SEEDED_FACEPP_KEY,
    api_secret: SEEDED_FACEPP_SECRET,
    base_url: SEEDED_FACEPP_BASE_URL,
    confidence_threshold: SEEDED_FACEPP_THRESHOLD,
  });

  let enrolled = 0;
  let failed = 0;

  for (const student of students) {
    if (!student.photo_url) {
      failed += 1;
      continue;
    }

    const detection = await faceppService.detectFace(student.photo_url);
    if (!detection.success || !detection.face_token) {
      failed += 1;
      await Student.updateOne(
        { _id: student._id },
        { $set: { face_token: null } },
      );
      continue;
    }

    await Student.updateOne(
      { _id: student._id },
      { $set: { face_token: detection.face_token } },
    );
    student.face_token = detection.face_token;
    enrolled += 1;
  }

  console.log(
    `✅ Face enrollment summary: ${enrolled} enrolled, ${failed} failed, 0 fake tokens written`,
  );

  return {
    enrolled,
    skipped: 0,
    failed,
  };
}

async function seedTenantSessions(tenant, tenantAdminId) {
  console.log("\n🗳️  Creating sample voting sessions...");

  const now = new Date();
  const activeStart = addDays(now, -1);
  const activeEnd = addDays(now, 1);
  const upcomingStart = addDays(new Date(), 5);
  const upcomingEnd = addDays(upcomingStart, 1);
  const endedStart = addDays(new Date(), -20);
  const endedEnd = addDays(new Date(), -19);

  const [activeSession, upcomingSession, endedSession] = await VotingSession.create([
    {
      tenant_id: tenant._id,
      title: "Faculty Presidents Election",
      description: "Live election used for active ballot verification and QA.",
      start_time: activeStart,
      end_time: activeEnd,
      categories: ["President"],
      location: {
        lat: 7.4208,
        lng: 4.9078,
        radius_meters: 1500,
      },
      is_off_campus_allowed: false,
      results_public: false,
      created_by: tenantAdminId,
      status: "active",
    },
    {
      tenant_id: tenant._id,
      title: "Student Representative Council Election",
      description: "Tenant-wide election for key student leadership offices.",
      start_time: upcomingStart,
      end_time: upcomingEnd,
      categories: ["President", "Vice President"],
      location: {
        lat: 7.4208,
        lng: 4.9078,
        radius_meters: 1500,
      },
      is_off_campus_allowed: false,
      results_public: true,
      created_by: tenantAdminId,
      status: "upcoming",
    },
    {
      tenant_id: tenant._id,
      title: "College of Computing Senatorial Election",
      description: "Completed senate seat election for computing students.",
      start_time: endedStart,
      end_time: endedEnd,
      categories: ["Senator"],
      location: {
        lat: 7.4208,
        lng: 4.9078,
        radius_meters: 1500,
      },
      is_off_campus_allowed: true,
      results_public: true,
      created_by: tenantAdminId,
      status: "ended",
    },
  ]);

  const candidates = await Candidate.insertMany([
    {
      tenant_id: tenant._id,
      session_id: activeSession._id,
      name: "Teniola Adebayo",
      position: "President",
      photo_url: STUDENT_PHOTO_URL,
      bio: "Focused on student experience, transparent voting, and faster issue resolution.",
      manifesto: "Reliable faculty representation and stronger welfare follow-up.",
    },
    {
      tenant_id: tenant._id,
      session_id: upcomingSession._id,
      name: "Adebayo Quadri",
      position: "President",
      photo_url: STUDENT_PHOTO_URL,
      bio: "Focused on accountability and transparent student representation.",
      manifesto:
        "Campus infrastructure, better class feedback loops, and welfare.",
    },
    {
      tenant_id: tenant._id,
      session_id: upcomingSession._id,
      name: "Chioma Nwosu",
      position: "Vice President",
      photo_url: STUDENT_PHOTO_URL,
      bio: "Committed to student engagement and inclusive decision-making.",
      manifesto:
        "Student parliament clinics and stronger hostel representation.",
    },
    {
      tenant_id: tenant._id,
      session_id: endedSession._id,
      name: "Ibrahim Yusuf",
      position: "Senator",
      photo_url: STUDENT_PHOTO_URL,
      bio: "Former departmental welfare secretary.",
      manifesto: "Better exam scheduling transparency and lab access.",
      vote_count: 18,
    },
  ]);

  activeSession.candidates = candidates
    .filter(
      (candidate) =>
        candidate.session_id.toString() === activeSession._id.toString(),
    )
    .map((candidate) => candidate._id);
  upcomingSession.candidates = candidates
    .filter(
      (candidate) =>
        candidate.session_id.toString() === upcomingSession._id.toString(),
    )
    .map((candidate) => candidate._id);
  endedSession.candidates = candidates
    .filter(
      (candidate) =>
        candidate.session_id.toString() === endedSession._id.toString(),
    )
    .map((candidate) => candidate._id);

  await Promise.all([
    activeSession.save(),
    upcomingSession.save(),
    endedSession.save(),
  ]);

  console.log("✅ Created 3 sessions with 4 candidates");
  return {
    activeSession,
    upcomingSession,
    endedSession,
    candidates,
  };
}

async function seedVotingBaseline(
  tenant,
  tenantAdminId,
  students,
  sessionsSeed,
  tenantAdmin,
) {
  if (tenant.slug !== TENANT_SLUG) {
    return;
  }

  const seededStudent = students.find(
    (student) => student.matric_no === "BU22CSC1005",
  );
  if (!seededStudent) {
    return;
  }

  const endedCandidate = sessionsSeed.candidates.find(
    (candidate) =>
      candidate.session_id.toString() === sessionsSeed.endedSession._id.toString(),
  );
  const activeCandidate = sessionsSeed.candidates.find(
    (candidate) =>
      candidate.session_id.toString() === sessionsSeed.activeSession._id.toString(),
  );

  if (!endedCandidate || !activeCandidate) {
    return;
  }

  await Vote.create({
    tenant_id: tenant._id,
    student_id: seededStudent._id,
    session_id: sessionsSeed.endedSession._id,
    candidate_id: endedCandidate._id,
    position: endedCandidate.position,
    geo_location: {
      lat: 7.4208,
      lng: 4.9078,
    },
    face_match_score: 94.2,
    face_verification_passed: true,
    face_token: seededStudent.face_token,
    status: "valid",
    device_id: "seeded-ios-device",
    ip_address: "127.0.0.1",
    timestamp: addDays(new Date(), -18),
  });

  await Candidate.updateOne(
    { _id: endedCandidate._id },
    { $inc: { vote_count: 1 } },
  );
  await Student.updateOne(
    { _id: seededStudent._id },
    { $addToSet: { has_voted_sessions: sessionsSeed.endedSession._id } },
  );

  await VerificationLog.insertMany([
    {
      tenant_id: tenant._id,
      user_id: seededStudent._id,
      session_id: sessionsSeed.endedSession._id,
      confidence_score: 94.2,
      threshold_used: SEEDED_FACEPP_THRESHOLD,
      result: "accepted",
      failure_reason: null,
      is_genuine_attempt: true,
      reviewed_by: tenantAdminId,
      reviewed_at: new Date(),
      review_note: "Seeded accepted genuine attempt for dashboard baseline.",
      provider: "facepp",
      device_id: "seeded-ios-device",
      ip_address: "127.0.0.1",
      geo_location: { lat: 7.4208, lng: 4.9078 },
      image_url: STUDENT_PHOTO_URL,
      timestamp: addDays(new Date(), -18),
      meta: {
        scenario: "correct_accept",
        seeded_by: tenantAdmin.email,
      },
    },
    {
      tenant_id: tenant._id,
      user_id: seededStudent._id,
      session_id: sessionsSeed.activeSession._id,
      confidence_score: 71.4,
      threshold_used: SEEDED_FACEPP_THRESHOLD,
      result: "rejected",
      failure_reason: "LOW_CONFIDENCE",
      is_genuine_attempt: true,
      reviewed_by: tenantAdminId,
      reviewed_at: new Date(),
      review_note: "Seeded false reject attempt for FRR visibility.",
      provider: "facepp",
      device_id: "seeded-android-device",
      ip_address: "127.0.0.2",
      geo_location: { lat: 7.4209, lng: 4.9079 },
      image_url: STUDENT_PHOTO_URL,
      timestamp: addDays(new Date(), -3),
      meta: {
        scenario: "false_reject",
      },
    },
    {
      tenant_id: tenant._id,
      user_id: seededStudent._id,
      session_id: sessionsSeed.activeSession._id,
      confidence_score: 91.3,
      threshold_used: SEEDED_FACEPP_THRESHOLD,
      result: "accepted",
      failure_reason: "FALSE_ACCEPT",
      is_genuine_attempt: false,
      reviewed_by: tenantAdminId,
      reviewed_at: new Date(),
      review_note: "Seeded impostor acceptance for FAR visibility.",
      provider: "facepp",
      device_id: "seeded-web-device",
      ip_address: "127.0.0.3",
      geo_location: { lat: 7.421, lng: 4.908 },
      image_url: STUDENT_PHOTO_URL,
      timestamp: addDays(new Date(), -2),
      meta: {
        scenario: "false_accept",
        candidate_id: activeCandidate._id,
      },
    },
    {
      tenant_id: tenant._id,
      user_id: seededStudent._id,
      session_id: sessionsSeed.activeSession._id,
      confidence_score: 38.5,
      threshold_used: SEEDED_FACEPP_THRESHOLD,
      result: "rejected",
      failure_reason: "NO_FACE_DETECTED",
      is_genuine_attempt: false,
      reviewed_by: tenantAdminId,
      reviewed_at: new Date(),
      review_note: "Seeded impostor rejection for accuracy baseline.",
      provider: "facepp",
      device_id: "seeded-web-device",
      ip_address: "127.0.0.4",
      geo_location: { lat: 7.4207, lng: 4.9077 },
      image_url: STUDENT_PHOTO_URL,
      timestamp: addDays(new Date(), -1),
      meta: {
        scenario: "correct_reject",
      },
    },
  ]);

  console.log(
    `✅ Seeded vote and biometric evaluation baseline for ${seededStudent.full_name} (${seededStudent.matric_no})`,
  );
}

async function seedNotifications(tenant, superAdmin, tenantAdmin, students) {
  console.log("\n🔔 Creating sample notifications...");

  const student = students[0];
  const secondStudent = students[1];
  const notifications = [
    {
      recipient_type: "super_admin",
      recipient_admin_id: superAdmin._id,
      type: "tenant.application.reviewed",
      title: "Tenant onboarding status updated",
      message: `${tenant.name} is active and fully provisioned.`,
      link: "/super-admin/tenants",
      priority: "medium",
      metadata: {
        tenant_id: tenant._id,
        tenant_slug: tenant.slug,
      },
      created_by_type: "system",
      is_read: false,
    },
  ];

  if (student) {
    notifications.unshift({
      tenant_id: tenant._id,
      recipient_type: "admin",
      recipient_admin_id: tenantAdmin._id,
      type: "support.ticket.created",
      title: "New support ticket: Face verification help",
      message: `${student.full_name} opened a support ticket about facial verification.`,
      link: "/dashboard/support",
      priority: "high",
      metadata: {
        ticket_number: "SUP-SEEDED-001",
        requester_type: "student",
      },
      created_by_type: "student",
      created_by_id: student._id,
      is_read: false,
    });
    notifications.push({
      tenant_id: tenant._id,
      recipient_type: "student",
      recipient_student_id: student._id,
      type: "support.ticket.reply.agent",
      title: "New support reply: Face verification help",
      message:
        "Support has replied with steps to complete your facial verification.",
      link: "/students/support",
      priority: "high",
      metadata: {
        ticket_number: "SUP-SEEDED-001",
      },
      created_by_type: "admin",
      created_by_id: tenantAdmin._id,
      is_read: false,
    });
    notifications.push({
      tenant_id: tenant._id,
      recipient_type: "student",
      recipient_student_id: secondStudent?._id || student._id,
      type: "session.results.available",
      title: "New result available",
      message:
        "Final results are now available for the College of Computing Senatorial Election.",
      link: "/students/results",
      priority: "medium",
      metadata: {
        session_title: "College of Computing Senatorial Election",
      },
      created_by_type: "system",
      is_read: true,
      read_at: new Date(),
    });
  }

  await Notification.insertMany(notifications);

  console.log("✅ Seeded sample notifications");
}

async function seedTestimonials(tenant) {
  console.log("\n💬 Creating sample testimonials...");

  await Testimonial.insertMany([
    {
      tenant_id: tenant._id,
      author_name: "Dr. Olamide Bakare",
      author_role: "Dean of Student Affairs",
      institution_name: tenant.name,
      quote:
        "Univote gave us a clean operational command center for elections. Setup, oversight, and post-election reporting now happen in one place.",
      rating: 5,
      source: "seed",
      status: "published",
      highlighted: true,
      sort_order: 1,
      published_at: new Date(),
    },
    {
      tenant_id: tenant._id,
      author_name: "Chioma Adeleke",
      author_role: "Student Representative",
      institution_name: tenant.name,
      quote:
        "Students stopped worrying about queues and transparency. The voting flow felt modern, quick, and trustworthy from login to confirmation.",
      rating: 5,
      source: "seed",
      status: "published",
      highlighted: true,
      sort_order: 2,
      published_at: new Date(),
    },
    {
      author_name: "Emeka Nwankwo",
      author_role: "Operations Lead",
      institution_name: "Northfield College",
      quote:
        "The tenant controls and reporting structure are strong enough for multi-campus elections. That is what convinced our governance team.",
      rating: 5,
      source: "seed",
      status: "published",
      highlighted: false,
      sort_order: 3,
      published_at: new Date(),
    },
    {
      author_name: "Aisha Mohammed",
      author_role: "Student Success Officer",
      institution_name: "Lakeside Polytechnic",
      quote:
        "We wanted a system that respected both institutional controls and student convenience. Univote finally gave us that balance.",
      rating: 4,
      source: "seed",
      status: "pending_review",
      highlighted: false,
      sort_order: 4,
    },
  ]);

  console.log("✅ Seeded testimonials");
}

async function seedAnnouncements(
  primaryTenant,
  secondaryTenant,
  superAdmin,
  tenantAdmin,
) {
  console.log("\n📣 Creating sample announcements...");

  await Announcement.insertMany([
    {
      owner_scope: "platform",
      tenant_id: null,
      audience_scope: "platform_tenant_admins",
      channels: ["in_app"],
      title: "Platform maintenance window",
      body: "A scheduled maintenance window is planned for Sunday at 2:00 AM WAT.",
      status: "published",
      published_at: new Date(),
      delivery_summary: {
        notifications_created: 2,
        emails_attempted: 0,
      },
      created_by_admin_id: superAdmin._id,
    },
    {
      owner_scope: "tenant",
      tenant_id: primaryTenant._id,
      audience_scope: "tenant_all_users",
      channels: ["in_app"],
      title: "Election week readiness",
      body: "Review your profile details and confirm device access before the next election window opens.",
      status: "published",
      published_at: new Date(),
      delivery_summary: {
        notifications_created: 1,
        emails_attempted: 0,
      },
      created_by_admin_id: tenantAdmin._id,
    },
    {
      owner_scope: "tenant",
      tenant_id: secondaryTenant._id,
      audience_scope: "tenant_admins",
      channels: ["in_app"],
      title: "Member workspace update",
      body: "Participant structure is configured for a flat member directory without academic departments.",
      status: "published",
      published_at: new Date(),
      delivery_summary: {
        notifications_created: 1,
        emails_attempted: 0,
      },
      created_by_admin_id: tenantAdmin._id,
    },
  ]);

  console.log("✅ Seeded announcements");
}

async function seed() {
  console.log("🌱 Starting multi-tenant database seed...\n");
  console.log("=".repeat(60));

  try {
    await connectDB();
    await clearDatabase();

    const {
      superAdmin,
      tenantAdmin,
      secondaryTenantAdmin,
      primaryTenantOpsAdmin,
      secondaryTenantSupportAdmin,
    } = await createPlatformAccounts();
    await seedPlatformDefaults();
    const { primaryTenant, secondaryTenant } = await createActiveDemoTenants(
      tenantAdmin._id,
      secondaryTenantAdmin._id,
      primaryTenantOpsAdmin._id,
      secondaryTenantSupportAdmin._id,
    );
    await createPipelineTenants();
    const primaryColleges = await seedTenantColleges(
      primaryTenant,
      tenantAdmin._id,
    );
    const primaryStudents = await seedTenantStudents(
      primaryTenant,
      primaryColleges,
    );
    await enrollSeedStudentFaces(primaryStudents);
    const primarySessions = await seedTenantSessions(primaryTenant, tenantAdmin._id);
    await seedVotingBaseline(
      primaryTenant,
      tenantAdmin._id,
      primaryStudents,
      primarySessions,
      tenantAdmin,
    );
    await seedNotifications(
      primaryTenant,
      superAdmin,
      tenantAdmin,
      primaryStudents,
    );
    await seedTestimonials(primaryTenant);

    const secondaryColleges = await seedTenantColleges(
      secondaryTenant,
      secondaryTenantAdmin._id,
    );
    const secondaryStudents = await seedTenantStudents(
      secondaryTenant,
      secondaryColleges,
    );
    await enrollSeedStudentFaces(secondaryStudents);
    await seedTenantSessions(secondaryTenant, secondaryTenantAdmin._id);
    await seedNotifications(
      secondaryTenant,
      superAdmin,
      secondaryTenantAdmin,
      secondaryStudents,
    );
    await seedAnnouncements(
      primaryTenant,
      secondaryTenant,
      superAdmin,
      tenantAdmin,
    );

    console.log("\n" + "=".repeat(60));
    console.log("✅ Seed completed successfully!\n");
    console.log("Credentials:");
    console.log(`   - Super Admin: ${SUPER_ADMIN_EMAIL} / ${DEFAULT_PASSWORD}`);
    console.log(
      `   - Tenant Owner: ${TENANT_ADMIN_EMAIL} / ${DEFAULT_PASSWORD}`,
    );
    console.log(
      `   - Tenant Owner: ${SECONDARY_TENANT_ADMIN_EMAIL} / ${DEFAULT_PASSWORD}`,
    );
    console.log(
      `   - Tenant Admin: ${PRIMARY_TENANT_OPS_ADMIN_EMAIL} / ${DEFAULT_PASSWORD}`,
    );
    console.log(
      `   - Tenant Admin: ${SECONDARY_TENANT_SUPPORT_ADMIN_EMAIL} / ${DEFAULT_PASSWORD}`,
    );
    console.log(`\nApproved tenants:`);
    console.log(
      `   - ${primaryTenant.name} (${primaryTenant.slug}) • owner ${TENANT_ADMIN_EMAIL} • ${primaryColleges.length} colleges • ${primaryStudents.length} students • active`,
    );
    console.log(
      `   - ${secondaryTenant.name} (${secondaryTenant.slug}) • owner ${SECONDARY_TENANT_ADMIN_EMAIL} • ${secondaryColleges.length} colleges • ${secondaryStudents.length} students • active`,
    );
    console.log("\nNotes:");
    console.log("   - The seed script is destructive and drops the database.");
    console.log(
      "   - Students are active and do not require first-login password setup.",
    );
    console.log(
      `   - Set DEFAULT_TENANT_SLUG=${TENANT_SLUG} locally for quick tenant admin testing.`,
    );
    console.log(
      `   - ${TENANT_ADMIN_EMAIL} and ${SECONDARY_TENANT_ADMIN_EMAIL} each have a direct approved university workspace for QA.`,
    );
    console.log(
      "   - Bowen includes BU22CSC1005 (Muhammed Abiodun), one active live-test session, one historical seeded vote, and reviewed biometric logs for FRR/FAR visibility.",
    );
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Database connection closed");
    process.exit(process.exitCode || 0);
  }
}

seed();
