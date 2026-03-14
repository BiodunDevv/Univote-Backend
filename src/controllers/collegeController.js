const College = require("../models/College");
const Student = require("../models/Student");
const cacheService = require("../services/cacheService");
const {
  getTenantScopedFilter,
  assignTenantId,
  getTenantCacheNamespace,
  prependTenantMatch,
} = require("../utils/tenantScope");

function buildTenantCollegeCacheKey(req, key) {
  return `${key}:${getTenantCacheNamespace(req)}`;
}

async function invalidateCollegeCaches(req, collegeId = null) {
  const tenantNamespace = getTenantCacheNamespace(req);

  const operations = [
    cacheService.delPattern(`admin:colleges:all:${tenantNamespace}:*`),
    cacheService.del(buildTenantCollegeCacheKey(req, "admin:college_statistics")),
    cacheService.del(buildTenantCollegeCacheKey(req, "admin:departments:overview")),
    cacheService.delPattern(`admin:departments:${tenantNamespace}:*`),
    // Legacy cleanup during migration.
    cacheService.delPattern("admin:colleges:all:*"),
    cacheService.del("admin:college_statistics"),
  ];

  if (collegeId) {
    operations.push(
      cacheService.del(buildTenantCollegeCacheKey(req, `admin:college:${collegeId}`)),
      cacheService.del(buildTenantCollegeCacheKey(req, `admin:college_stats:${collegeId}`)),
      cacheService.del(`admin:college:${collegeId}`),
      cacheService.del(`admin:college_stats:${collegeId}`),
    );
  }

  await Promise.all(operations);
}

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
        ...getTenantScopedFilter(req, {}),
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
        ...assignTenantId(req, {}),
        name,
        code: code.toUpperCase(),
        description: description || "",
        dean_name: dean_name || "",
        dean_email: dean_email || "",
        departments: departments || [],
        created_by: req.adminId,
      });

      await college.save();

      // Invalidate cached college data
      await invalidateCollegeCaches(req, college._id.toString());

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

      // Try cache first (5 minute TTL)
      const cacheKey = buildTenantCollegeCacheKey(
        req,
        `admin:colleges:all:${is_active || "all"}:${include_departments}`,
      );
      const cachedColleges = await cacheService.get(cacheKey);

      if (cachedColleges) {
        return res.json({
          ...cachedColleges,
          cached: true,
        });
      }

      const filter = getTenantScopedFilter(req, {});
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
      const studentCounts = await Student.aggregate(
        prependTenantMatch(req, [
          {
            $group: {
              _id: { college: "$college", department: "$department" },
              count: { $sum: 1 },
            },
          },
        ]),
      );

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

      const responseData = {
        colleges,
        total: colleges.length,
        cached: false,
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, responseData, 300);

      res.json(responseData);
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

      // Try cache first (5 minute TTL)
      const cacheKey = buildTenantCollegeCacheKey(req, `admin:college:${id}`);
      const cachedCollege = await cacheService.get(cacheKey);

      if (cachedCollege) {
        return res.json({
          ...cachedCollege,
          cached: true,
        });
      }

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: id }),
      ).lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Get student counts in one aggregation query
      const studentCounts = await Student.aggregate(
        prependTenantMatch(req, [
          {
            $match: { college: college.name },
          },
          {
            $group: {
              _id: "$department",
              count: { $sum: 1 },
            },
          },
        ]),
      );

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

      const responseData = {
        college,
        cached: false,
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, responseData, 300);

      res.json(responseData);
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

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: id }),
      );

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Check for duplicate name/code if changing
      if (name || code) {
        const duplicateQuery = { _id: { $ne: id } };
        if (name) duplicateQuery.name = name;
        if (code) duplicateQuery.code = code.toUpperCase();

        const duplicate = await College.findOne(
          getTenantScopedFilter(req, {
            _id: { $ne: id },
            $or: [
              ...(name ? [{ name }] : []),
              ...(code ? [{ code: code.toUpperCase() }] : []),
            ],
          }),
        );

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

      // Invalidate cached college data
      await invalidateCollegeCaches(req, id);

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

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: id }),
      );

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Check if college has students
      const studentCount = await Student.countDocuments(
        getTenantScopedFilter(req, {
          college: college.name,
        }),
      );

      if (studentCount > 0 && force !== "true") {
        return res.status(400).json({
          error: `Cannot delete college with ${studentCount} students. Use ?force=true to force delete and remove all students.`,
          student_count: studentCount,
        });
      }

      // If force delete, remove all students in this college
      if (force === "true" && studentCount > 0) {
        await Student.deleteMany(
          getTenantScopedFilter(req, { college: college.name }),
        );
        console.log(`Deleted ${studentCount} students from ${college.name}`);
      }

      await College.findOneAndDelete(getTenantScopedFilter(req, { _id: id }));

      // Invalidate cached college data
      await invalidateCollegeCaches(req, id);

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

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: id }),
      );

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Check for duplicate department code in this college
      const existingDept = college.departments.find(
        (d) => d.code.toUpperCase() === code.toUpperCase() || d.name === name,
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

      // Invalidate cached college data
      await invalidateCollegeCaches(req, id);

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

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: id }),
      ).lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Get student counts for all departments in one query
      const studentCounts = await Student.aggregate(
        prependTenantMatch(req, [
          {
            $match: { college: college.name },
          },
          {
            $group: {
              _id: "$department",
              count: { $sum: 1 },
            },
          },
        ]),
      );

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

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: collegeId }),
      );

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const department = college.departments.id(deptId);

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      // Update student count
      department.student_count = await Student.countDocuments(
        getTenantScopedFilter(req, {
          college: college.name,
          department: department.name,
        }),
      );

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

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: collegeId }),
      );

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
            (d.name === name || d.code.toUpperCase() === code?.toUpperCase()),
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

      // Invalidate cached college data
      await invalidateCollegeCaches(req, collegeId);

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

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: collegeId }),
      );

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const department = college.departments.id(deptId);

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      // Check if department has students
      const studentCount = await Student.countDocuments(
        getTenantScopedFilter(req, {
          college: college.name,
          department: department.name,
        }),
      );

      if (studentCount > 0 && force !== "true") {
        return res.status(400).json({
          error: `Cannot delete department with ${studentCount} students. Use ?force=true to force delete and remove all students.`,
          student_count: studentCount,
        });
      }

      // If force delete, remove all students in this department
      if (force === "true" && studentCount > 0) {
        await Student.deleteMany(
          getTenantScopedFilter(req, {
            college: college.name,
            department: department.name,
          }),
        );
        console.log(`Deleted ${studentCount} students from ${department.name}`);
      }

      const deletedDept = {
        id: department._id,
        name: department.name,
        code: department.code,
      };

      college.departments.pull(deptId);
      await college.save();

      // Invalidate cached college data
      await invalidateCollegeCaches(req, collegeId);

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
      // Try cache first (10 minute TTL)
      const cacheKey = buildTenantCollegeCacheKey(req, "admin:college_statistics");
      const cachedStats = await cacheService.get(cacheKey);

      if (cachedStats) {
        return res.json({
          ...cachedStats,
          cached: true,
        });
      }

      const colleges = await College.find(getTenantScopedFilter(req, {})).lean();

      // Get all student counts in one aggregation
      const studentCounts = await Student.aggregate(
        prependTenantMatch(req, [
          {
            $group: {
              _id: "$college",
              count: { $sum: 1 },
            },
          },
        ]),
      );

      const totalStudents = await Student.countDocuments(
        getTenantScopedFilter(req, {}),
      );

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

      const responseData = {
        statistics: stats,
        cached: false,
      };

      // Cache for 10 minutes
      await cacheService.set(cacheKey, responseData, 600);

      res.json(responseData);
    } catch (error) {
      console.error("Get college statistics error:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  }

  /**
   * Per-college detailed statistics
   * GET /api/admin/colleges/:id/stats
   */
  async getCollegeDetailStats(req, res) {
    try {
      const { id } = req.params;

      const cacheKey = buildTenantCollegeCacheKey(req, `admin:college_stats:${id}`);
      const cachedStats = await cacheService.get(cacheKey);

      if (cachedStats) {
        return res.json({
          ...cachedStats,
          cached: true,
        });
      }

      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: id }),
      ).lean();
      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const departmentStats = await Promise.all(
        college.departments.map(async (department) => {
          const studentFilter = {
            college: college.name,
            department: department.name,
          };

          const [totalStudents, activeStudents, levelDistributionRaw] =
            await Promise.all([
              Student.countDocuments(getTenantScopedFilter(req, studentFilter)),
              Student.countDocuments({
                ...getTenantScopedFilter(req, studentFilter),
                is_active: true,
              }),
              Student.aggregate(
                prependTenantMatch(req, [
                  { $match: studentFilter },
                  { $group: { _id: "$level", count: { $sum: 1 } } },
                  { $sort: { _id: 1 } },
                ]),
              ),
            ]);

          const level_distribution = levelDistributionRaw.reduce(
            (acc, item) => {
              acc[item._id] = item.count;
              return acc;
            },
            {},
          );

          return {
            department_id: department._id,
            department_name: department.name,
            department_code: department.code,
            is_active: department.is_active,
            total_students: totalStudents,
            active_students: activeStudents,
            inactive_students: totalStudents - activeStudents,
            level_distribution,
          };
        }),
      );

      const totalStudents = departmentStats.reduce(
        (sum, department) => sum + department.total_students,
        0,
      );
      const activeStudents = departmentStats.reduce(
        (sum, department) => sum + department.active_students,
        0,
      );

      const responseData = {
        college_id: college._id,
        college_name: college.name,
        college_code: college.code,
        total_departments: college.departments.length,
        total_students: totalStudents,
        active_students: activeStudents,
        inactive_students: totalStudents - activeStudents,
        departments: departmentStats,
        cached: false,
      };

      await cacheService.set(cacheKey, responseData, 300);

      return res.json(responseData);
    } catch (error) {
      console.error("Get college detail stats error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch college statistics" });
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

      const colleges = await College.find(getTenantScopedFilter(req, filter));
      const results = [];

      for (const college of colleges) {
        const matchingDepts = college.departments.filter(
          (dept) =>
            dept.name.toLowerCase().includes(query.toLowerCase()) ||
            dept.code.toLowerCase().includes(query.toLowerCase()),
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

  async getAllDepartments(req, res) {
    try {
      const { page = 1, limit = 20, search, college_id, is_active } = req.query;

      const pageNumber = Number.parseInt(page, 10) || 1;
      const limitNumber = Number.parseInt(limit, 10) || 20;

      const collegeFilter = {};
      if (college_id) {
        collegeFilter._id = college_id;
      }

      const colleges = await College.find(getTenantScopedFilter(req, collegeFilter))
        .select("name code departments")
        .lean();

      const studentCounts = await Student.aggregate(
        prependTenantMatch(req, [
          {
            $group: {
              _id: { college: "$college", department: "$department" },
              count: { $sum: 1 },
            },
          },
        ]),
      );

      const deptCountMap = {};
      studentCounts.forEach((item) => {
        deptCountMap[`${item._id.college}|||${item._id.department}`] =
          item.count;
      });

      let departments = [];

      colleges.forEach((college) => {
        (college.departments || []).forEach((department) => {
          departments.push({
            _id: department._id,
            name: department.name,
            code: department.code,
            description: department.description || "",
            hod_name: department.hod_name || "",
            hod_email: department.hod_email || "",
            available_levels: department.available_levels || [],
            is_active: department.is_active,
            student_count:
              deptCountMap[`${college.name}|||${department.name}`] || 0,
            college: {
              id: college._id,
              name: college.name,
              code: college.code,
            },
          });
        });
      });

      if (is_active === "true" || is_active === "false") {
        const activeValue = is_active === "true";
        departments = departments.filter(
          (department) => department.is_active === activeValue,
        );
      }

      if (search) {
        const searchValue = search.toLowerCase();
        departments = departments.filter(
          (department) =>
            department.name.toLowerCase().includes(searchValue) ||
            department.code.toLowerCase().includes(searchValue) ||
            department.college.name.toLowerCase().includes(searchValue),
        );
      }

      departments.sort((a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
      );

      const total = departments.length;
      const start = (pageNumber - 1) * limitNumber;
      const paginated = departments.slice(start, start + limitNumber);

      res.json({
        departments: paginated,
        total,
        page: pageNumber,
        pages: Math.ceil(total / limitNumber),
        limit: limitNumber,
      });
    } catch (error) {
      console.error("Get all departments error:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  }

  async getDepartmentOverview(req, res) {
    try {
      const [colleges, totalStudents] = await Promise.all([
        College.find(getTenantScopedFilter(req, {}))
          .select("name code departments")
          .lean(),
        Student.countDocuments(getTenantScopedFilter(req, {})),
      ]);

      const studentCounts = await Student.aggregate(
        prependTenantMatch(req, [
          {
            $group: {
              _id: { college: "$college", department: "$department" },
              count: { $sum: 1 },
            },
          },
        ]),
      );

      const deptCountMap = {};
      studentCounts.forEach((item) => {
        deptCountMap[`${item._id.college}|||${item._id.department}`] =
          item.count;
      });

      let totalDepartments = 0;
      let activeDepartments = 0;
      let inactiveDepartments = 0;

      const collegesBreakdown = colleges.map((college) => {
        const departments = college.departments || [];
        totalDepartments += departments.length;

        departments.forEach((department) => {
          if (department.is_active) {
            activeDepartments += 1;
          } else {
            inactiveDepartments += 1;
          }
        });

        const studentCount = departments.reduce((sum, department) => {
          return (
            sum + (deptCountMap[`${college.name}|||${department.name}`] || 0)
          );
        }, 0);

        return {
          id: college._id,
          name: college.name,
          code: college.code,
          department_count: departments.length,
          student_count: studentCount,
        };
      });

      res.json({
        totals: {
          total_departments: totalDepartments,
          active_departments: activeDepartments,
          inactive_departments: inactiveDepartments,
          total_students: totalStudents,
        },
        colleges: collegesBreakdown,
      });
    } catch (error) {
      console.error("Get department overview error:", error);
      res.status(500).json({ error: "Failed to fetch department overview" });
    }
  }
}

module.exports = new CollegeController();
