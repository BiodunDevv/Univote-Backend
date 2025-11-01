module.exports = {
  // College and Department mapping with codes
  collegesAndDepartments: {
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
  },

  // Legacy format for backward compatibility (if needed)
  colleges: [
    "College of Agriculture, Engineering and Science",
    "College of Management and Social Sciences",
    "College of Law",
    "College of Liberal Studies",
    "College of Health Sciences",
    "College of Computing and Communication Studies",
    "College of Environmental Sciences",
  ],

  levels: ["100", "200", "300", "400", "500", "600"],

  defaultPassword: "1234",

  faceConfidenceThreshold: 80, // Confidence threshold for face matching (0-100)

  campusLocations: {
    "Bowen University": {
      lat: 7.8525,
      lng: 4.2811,
      radius: 5000,
    },
  },
};
