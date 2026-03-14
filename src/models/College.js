const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: "",
    },
    hod_name: {
      type: String,
      default: "",
    },
    hod_email: {
      type: String,
      default: "",
    },
    available_levels: {
      type: [String],
      enum: ["100", "200", "300", "400", "500", "600"],
      default: ["100", "200", "300", "400"],
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    student_count: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const collegeSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    dean_name: {
      type: String,
      default: "",
    },
    dean_email: {
      type: String,
      default: "",
    },
    departments: [departmentSchema],
    is_active: {
      type: Boolean,
      default: true,
    },
    student_count: {
      type: Number,
      default: 0,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
collegeSchema.index(
  { tenant_id: 1, name: 1 },
  { unique: true, partialFilterExpression: { tenant_id: { $type: "objectId" } } },
);
collegeSchema.index(
  { tenant_id: 1, code: 1 },
  { unique: true, partialFilterExpression: { tenant_id: { $type: "objectId" } } },
);
collegeSchema.index({ "departments.code": 1 });
collegeSchema.index({ is_active: 1 });
collegeSchema.index({ tenant_id: 1, is_active: 1 });

// Method to add department
collegeSchema.methods.addDepartment = function (departmentData) {
  this.departments.push(departmentData);
  return this.save();
};

// Method to update department
collegeSchema.methods.updateDepartment = function (deptId, updates) {
  const dept = this.departments.id(deptId);
  if (!dept) return null;

  Object.keys(updates).forEach((key) => {
    if (updates[key] !== undefined) {
      dept[key] = updates[key];
    }
  });

  return this.save();
};

// Method to remove department
collegeSchema.methods.removeDepartment = function (deptId) {
  this.departments.pull(deptId);
  return this.save();
};

// Static method to get college by department name
collegeSchema.statics.findByDepartmentName = function (departmentName) {
  return this.findOne({ "departments.name": departmentName });
};

// Static method to get college by department code
collegeSchema.statics.findByDepartmentCode = function (departmentCode) {
  return this.findOne({ "departments.code": departmentCode.toUpperCase() });
};

module.exports = mongoose.model("College", collegeSchema);
