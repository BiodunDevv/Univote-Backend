module.exports = {
  colleges: [
    "College of Agriculture, Engineering and Science",
    "College of Management and Social Sciences",
    "College of Law",
    "College of Liberal Studies",
    "College of Health Sciences",
    "College of Computing and Communication Studies",
    "College of Environmental Sciences",
  ],

  departments: {
    "College of Agriculture, Engineering and Science": [
      "Agricultural Economics",
      "Animal Production and Health",
      "Crop Production and Soil Science",
      "Chemical Engineering",
      "Civil Engineering",
      "Electrical and Electronics Engineering",
      "Mechanical Engineering",
      "Petroleum Engineering",
      "Biochemistry",
      "Chemistry",
      "Industrial Chemistry",
      "Computer Science",
      "Mathematics",
      "Microbiology",
      "Physics with Electronics",
    ],
    "College of Management and Social Sciences": [
      "Accounting",
      "Business Administration",
      "Economics",
      "Banking and Finance",
      "Entrepreneurship",
      "Mass Communication",
      "Political Science",
      "International Relations",
      "Sociology",
      "Psychology",
    ],
    "College of Law": ["Common and Islamic Law"],
    "College of Liberal Studies": [
      "English Language",
      "French",
      "History and International Studies",
      "Christian Religious Studies",
      "Islamic Studies",
      "Music",
    ],
    "College of Health Sciences": [
      "Medicine and Surgery",
      "Nursing Science",
      "Public Health",
      "Physiology",
      "Anatomy",
      "Pharmacology",
    ],
    "College of Computing and Communication Studies": [
      "Computer Science",
      "Software Engineering",
      "Cyber Security",
      "Information Technology",
      "Data Science",
      "Mass Communication",
    ],
    "College of Environmental Sciences": [
      "Architecture",
      "Estate Management",
      "Quantity Surveying",
      "Building Technology",
      "Urban and Regional Planning",
    ],
  },

  levels: ["100", "200", "300", "400", "500", "600"],

  defaultPassword: "1234",

  azureFaceThreshold: 0.7, // Confidence threshold for face matching

  campusLocations: {
    "Bowen University": {
      lat: 7.8525,
      lng: 4.2811,
      radius: 5000,
    },
  },
};
