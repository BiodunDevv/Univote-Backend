const College = require("../models/College");
const Student = require("../models/Student");

class CollegeController {
  /**
   * Create a new college
   * POST /api/admin/colleges
   */
  async createCollege(req, res) {
    try {
      const { name, code, description, dean_name, dean_email, departments } =
        req.body;

      // Validate required fields
      if (!name || !code) {
        return res
          .status(400)
          .json({ error: "College name and code are required" });
      }

      // Check if college already exists
      const existingCollege = await College.findOne({
        $or: [{ name: name }, { code: code.toUpperCase() }],
      });

      if (existingCollege) {
        return res.status(409).json({
          error: "College with this name or code already exists",
        });
      }

      // Validate departments if provided
      if (departments && Array.isArray(departments)) {
        const deptCodes = departments.map((d) => d.code?.toUpperCase());
        const uniqueCodes = new Set(deptCodes);

        if (deptCodes.length !== uniqueCodes.size) {
          return res.status(400).json({
            error: "Duplicate department codes found",
          });
        }
      }

      // Create college
      const college = new College({
        name,
        code: code.toUpperCase(),
        description: description || "",
        dean_name: dean_name || "",
        dean_email: dean_email || "",
        departments: departments || [],
        created_by: req.adminId,
      });

      await college.save();

      res.status(201).json({
        message: "College created successfully",
        college,
      });
    } catch (error) {
      console.error("Create college error:", error);
      res.status(500).json({ error: "Failed to create college" });
    }
  }

  /**
   * Get all colleges
   * GET /api/admin/colleges
   */
  async getAllColleges(req, res) {
    try {
      const { is_active, include_departments = "true" } = req.query;

      const filter = {};
      if (is_active !== undefined) {
        filter.is_active = is_active === "true";
      }

      // Fetch colleges first
      let colleges;
      if (include_departments === "false") {
        colleges = await College.find(filter)
          .select("-departments")
          .sort({ name: 1 })
          .lean();
      } else {
        colleges = await College.find(filter).sort({ name: 1 }).lean();
      }

      // Get all student counts in one aggregation query
      const studentCounts = await Student.aggregate([
        {
          $group: {
            _id: { college: "$college", department: "$department" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Create lookup maps for fast access
      const collegeCountMap = {};
      const deptCountMap = {};

      studentCounts.forEach((item) => {
        const college = item._id.college;
        const dept = item._id.department;
        const count = item.count;

        // College total
        if (!collegeCountMap[college]) {
          collegeCountMap[college] = 0;
        }
        collegeCountMap[college] += count;

        // Department count
        const key = `${college}|||${dept}`;
        deptCountMap[key] = count;
      });

      // Assign counts to colleges and departments
      colleges.forEach((college) => {
        college.student_count = collegeCountMap[college.name] || 0;

        if (include_departments === "true" && college.departments) {
          college.departments.forEach((dept) => {
            const key = `${college.name}|||${dept.name}`;
            dept.student_count = deptCountMap[key] || 0;
          });
        }
      });

      res.json({
        colleges,
        total: colleges.length,
      });
    } catch (error) {
      console.error("Get all colleges error:", error);
      res.status(500).json({ error: "Failed to fetch colleges" });
    }
  }

  /**
   * Get single college by ID
   * GET /api/admin/colleges/:id
   */
  async getCollegeById(req, res) {
    try {
      const { id } = req.params;

      const college = await College.findById(id).lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Get student counts in one aggregation query
      const studentCounts = await Student.aggregate([
        {
          $match: { college: college.name },
        },
        {
          $group: {
            _id: "$department",
            count: { $sum: 1 },
          },
        },
      ]);

      // Create department count map
      const deptCountMap = {};
      let totalStudents = 0;

      studentCounts.forEach((item) => {
        deptCountMap[item._id] = item.count;
        totalStudents += item.count;
      });

      // Assign counts
      college.student_count = totalStudents;

      if (college.departments) {
        college.departments.forEach((dept) => {
          dept.student_count = deptCountMap[dept.name] || 0;
        });
      }

      res.json({ college });
    } catch (error) {
      console.error("Get college by ID error:", error);
      res.status(500).json({ error: "Failed to fetch college" });
    }
  }

  /**
   * Update college
   * PATCH /api/admin/colleges/:id
   */
  async updateCollege(req, res) {
    try {
      const { id } = req.params;
      const { name, code, description, dean_name, dean_email, is_active } =
        req.body;

      const college = await College.findById(id);

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Check for duplicate name/code if changing
      if (name || code) {
        const duplicateQuery = { _id: { $ne: id } };
        if (name) duplicateQuery.name = name;
        if (code) duplicateQuery.code = code.toUpperCase();

        const duplicate = await College.findOne({
          _id: { $ne: id },
          $or: [
            ...(name ? [{ name }] : []),
            ...(code ? [{ code: code.toUpperCase() }] : []),
          ],
        });

        if (duplicate) {
          return res.status(409).json({
            error: "Another college with this name or code already exists",
          });
        }
      }

      // Update fields
      if (name !== undefined) college.name = name;
      if (code !== undefined) college.code = code.toUpperCase();
      if (description !== undefined) college.description = description;
      if (dean_name !== undefined) college.dean_name = dean_name;
      if (dean_email !== undefined) college.dean_email = dean_email;
      if (is_active !== undefined) college.is_active = is_active;

      await college.save();

      res.json({
        message: "College updated successfully",
        college,
      });
    } catch (error) {
      console.error("Update college error:", error);
      res.status(500).json({ error: "Failed to update college" });
    }
  }

  /**
   * Delete college
   * DELETE /api/admin/colleges/:id
   */
  async deleteCollege(req, res) {
    try {
      const { id } = req.params;
      const { force = "false" } = req.query;

      const college = await College.findById(id);

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Check if college has students
      const studentCount = await Student.countDocuments({
        college: college.name,
      });

      if (studentCount > 0 && force !== "true") {
        return res.status(400).json({
          error: `Cannot delete college with ${studentCount} students. Use ?force=true to force delete and remove all students.`,
          student_count: studentCount,
        });
      }

      // If force delete, remove all students in this college
      if (force === "true" && studentCount > 0) {
        await Student.deleteMany({ college: college.name });
        console.log(`Deleted ${studentCount} students from ${college.name}`);
      }

      await College.findByIdAndDelete(id);

      res.json({
        message:
          force === "true" && studentCount > 0
            ? `College and ${studentCount} students deleted successfully`
            : "College deleted successfully",
        deleted_college: {
          id: college._id,
          name: college.name,
          code: college.code,
        },
        deleted_students: force === "true" ? studentCount : 0,
      });
    } catch (error) {
      console.error("Delete college error:", error);
      res.status(500).json({ error: "Failed to delete college" });
    }
  }

  /**
   * Add department to college
   * POST /api/admin/colleges/:id/departments
   */
  async addDepartment(req, res) {
    try {
      const { id } = req.params;
      const { name, code, description, hod_name, hod_email, available_levels } =
        req.body;

      if (!name || !code) {
        return res.status(400).json({
          error: "Department name and code are required",
        });
      }

      const college = await College.findById(id);

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Check for duplicate department code in this college
      const existingDept = college.departments.find(
        (d) => d.code.toUpperCase() === code.toUpperCase() || d.name === name
      );

      if (existingDept) {
        return res.status(409).json({
          error:
            "Department with this name or code already exists in this college",
        });
      }

      // Add department
      const departmentData = {
        name,
        code: code.toUpperCase(),
        description: description || "",
        hod_name: hod_name || "",
        hod_email: hod_email || "",
        available_levels: available_levels || ["100", "200", "300", "400"],
        is_active: true,
      };

      college.departments.push(departmentData);
      await college.save();

      const addedDept = college.departments[college.departments.length - 1];

      res.status(201).json({
        message: "Department added successfully",
        department: addedDept,
        college: {
          id: college._id,
          name: college.name,
          code: college.code,
        },
      });
    } catch (error) {
      console.error("Add department error:", error);
      res.status(500).json({ error: "Failed to add department" });
    }
  }

  /**
   * Get all departments in a college
   * GET /api/admin/colleges/:id/departments
   */
  async getDepartments(req, res) {
    try {
      const { id } = req.params;

      const college = await College.findById(id).lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Get student counts for all departments in one query
      const studentCounts = await Student.aggregate([
        {
          $match: { college: college.name },
        },
        {
          $group: {
            _id: "$department",
            count: { $sum: 1 },
          },
        },
      ]);

      // Create department count map
      const deptCountMap = {};
      studentCounts.forEach((item) => {
        deptCountMap[item._id] = item.count;
      });

      // Assign student counts to departments
      college.departments.forEach((dept) => {
        dept.student_count = deptCountMap[dept.name] || 0;
      });

      res.json({
        college: {
          id: college._id,
          name: college.name,
          code: college.code,
        },
        departments: college.departments,
        total: college.departments.length,
      });
    } catch (error) {
      console.error("Get departments error:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  }

  /**
   * Get single department
   * GET /api/admin/colleges/:collegeId/departments/:deptId
   */
  async getDepartmentById(req, res) {
    try {
      const { collegeId, deptId } = req.params;

      const college = await College.findById(collegeId);

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const department = college.departments.id(deptId);

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      // Update student count
      department.student_count = await Student.countDocuments({
        college: college.name,
        department: department.name,
      });

      await college.save();

      res.json({
        college: {
          id: college._id,
          name: college.name,
          code: college.code,
        },
        department,
      });
    } catch (error) {
      console.error("Get department by ID error:", error);
      res.status(500).json({ error: "Failed to fetch department" });
    }
  }

  /**
   * Update department
   * PATCH /api/admin/colleges/:collegeId/departments/:deptId
   */
  async updateDepartment(req, res) {
    try {
      const { collegeId, deptId } = req.params;
      const {
        name,
        code,
        description,
        hod_name,
        hod_email,
        available_levels,
        is_active,
      } = req.body;

      const college = await College.findById(collegeId);

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const department = college.departments.id(deptId);

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      // Check for duplicate name/code if changing
      if (name || code) {
        const duplicate = college.departments.find(
          (d) =>
            d._id.toString() !== deptId &&
            (d.name === name || d.code.toUpperCase() === code?.toUpperCase())
        );

        if (duplicate) {
          return res.status(409).json({
            error:
              "Another department with this name or code already exists in this college",
          });
        }
      }

      // Update fields
      if (name !== undefined) department.name = name;
      if (code !== undefined) department.code = code.toUpperCase();
      if (description !== undefined) department.description = description;
      if (hod_name !== undefined) department.hod_name = hod_name;
      if (hod_email !== undefined) department.hod_email = hod_email;
      if (available_levels !== undefined)
        department.available_levels = available_levels;
      if (is_active !== undefined) department.is_active = is_active;

      await college.save();

      res.json({
        message: "Department updated successfully",
        department,
      });
    } catch (error) {
      console.error("Update department error:", error);
      res.status(500).json({ error: "Failed to update department" });
    }
  }

  /**
   * Delete department
   * DELETE /api/admin/colleges/:collegeId/departments/:deptId
   */
  async deleteDepartment(req, res) {
    try {
      const { collegeId, deptId } = req.params;
      const { force = "false" } = req.query;

      const college = await College.findById(collegeId);

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const department = college.departments.id(deptId);

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      // Check if department has students
      const studentCount = await Student.countDocuments({
        college: college.name,
        department: department.name,
      });

      if (studentCount > 0 && force !== "true") {
        return res.status(400).json({
          error: `Cannot delete department with ${studentCount} students. Use ?force=true to force delete and remove all students.`,
          student_count: studentCount,
        });
      }

      // If force delete, remove all students in this department
      if (force === "true" && studentCount > 0) {
        await Student.deleteMany({
          college: college.name,
          department: department.name,
        });
        console.log(`Deleted ${studentCount} students from ${department.name}`);
      }

      const deletedDept = {
        id: department._id,
        name: department.name,
        code: department.code,
      };

      college.departments.pull(deptId);
      await college.save();

      res.json({
        message:
          force === "true" && studentCount > 0
            ? `Department and ${studentCount} students deleted successfully`
            : "Department deleted successfully",
        deleted_department: deletedDept,
        deleted_students: force === "true" ? studentCount : 0,
      });
    } catch (error) {
      console.error("Delete department error:", error);
      res.status(500).json({ error: "Failed to delete department" });
    }
  }

  /**
   * Get college statistics
   * GET /api/admin/colleges/statistics
   */
  async getCollegeStatistics(req, res) {
    try {
      const colleges = await College.find({}).lean();

      // Get all student counts in one aggregation
      const studentCounts = await Student.aggregate([
        {
          $group: {
            _id: "$college",
            count: { $sum: 1 },
          },
        },
      ]);

      const totalStudents = await Student.countDocuments();

      // Create college count map
      const collegeCountMap = {};
      studentCounts.forEach((item) => {
        collegeCountMap[item._id] = item.count;
      });

      let totalDepartments = 0;
      const collegesBreakdown = [];

      for (const college of colleges) {
        const studentCount = collegeCountMap[college.name] || 0;
        const deptCount = college.departments.length;

        totalDepartments += deptCount;

        collegesBreakdown.push({
          id: college._id,
          name: college.name,
          code: college.code,
          department_count: deptCount,
          student_count: studentCount,
          is_active: college.is_active,
        });
      }

      const stats = {
        total_colleges: colleges.length,
        active_colleges: colleges.filter((c) => c.is_active).length,
        inactive_colleges: colleges.filter((c) => !c.is_active).length,
        total_departments: totalDepartments,
        total_students: totalStudents,
        colleges_breakdown: collegesBreakdown,
      };

      res.json({ statistics: stats });
    } catch (error) {
      console.error("Get college statistics error:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  }

  /**
   * Search departments across all colleges
   * GET /api/admin/departments/search
   */
  async searchDepartments(req, res) {
    try {
      const { query, college_id } = req.query;

      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const filter = {};
      if (college_id) {
        filter._id = college_id;
      }

      const colleges = await College.find(filter);
      const results = [];

      for (const college of colleges) {
        const matchingDepts = college.departments.filter(
          (dept) =>
            dept.name.toLowerCase().includes(query.toLowerCase()) ||
            dept.code.toLowerCase().includes(query.toLowerCase())
        );

        for (const dept of matchingDepts) {
          results.push({
            department: dept,
            college: {
              id: college._id,
              name: college.name,
              code: college.code,
            },
          });
        }
      }

      res.json({
        results,
        total: results.length,
      });
    } catch (error) {
      console.error("Search departments error:", error);
      res.status(500).json({ error: "Failed to search departments" });
    }
  }
}

module.exports = new CollegeController();
