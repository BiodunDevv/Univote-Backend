const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const Tenant = require("../models/Tenant");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const {
  getDefaultPermissionsForRole,
  getTenantRoleCatalog,
} = require("../config/tenantRoles");
const {
  buildQuotaErrorMessage,
  getTenantQuotaStatus,
} = require("../services/planAccessService");
const emailService = require("../services/emailService");
const constants = require("../config/constants");

function serializeMembership(membership, admin) {
  return {
    id: membership._id,
    tenant_id: membership.tenant_id,
    admin_id: admin._id,
    email: admin.email,
    full_name: admin.full_name,
    global_role: admin.role,
    is_global_active: admin.is_active,
    role: membership.role,
    permissions: membership.permissions || [],
    is_active: membership.is_active,
    last_access_at: membership.last_access_at,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

function isSupportedTenantRole(role) {
  return getTenantRoleCatalog().some((entry) => entry.code === role);
}

async function buildMembershipResponse(membership) {
  const admin = await Admin.findById(membership.admin_id)
    .select("-password_hash -reset_password_code -reset_password_expires")
    .lean();

  if (!admin) {
    return null;
  }

  return serializeMembership(membership, admin);
}

class TenantAdminController {
  async getRoleCatalog(_req, res) {
    return res.json({
      roles: getTenantRoleCatalog(),
    });
  }

  async getOnboardingDetails(req, res) {
    try {
      const tenant = await Tenant.findById(req.tenantId)
        .select("onboarding.contact_name onboarding.contact_email")
        .lean();

      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      return res.json({
        onboarding: {
          contact_name: tenant.onboarding?.contact_name || null,
          contact_email: tenant.onboarding?.contact_email || null,
        },
      });
    } catch (error) {
      console.error("Get onboarding details error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch onboarding details" });
    }
  }

  async getOverview(req, res) {
    try {
      const tenantId = req.tenantId;
      const memberships = await TenantAdminMembership.find({
        tenant_id: tenantId,
      }).lean();

      const totals = {
        total_members: memberships.length,
        active_members: memberships.filter((membership) => membership.is_active)
          .length,
        owners: memberships.filter((membership) => membership.role === "owner")
          .length,
        admins: memberships.filter((membership) => membership.role === "admin")
          .length,
        support: memberships.filter(
          (membership) => membership.role === "support",
        ).length,
        analysts: memberships.filter(
          (membership) => membership.role === "analyst",
        ).length,
      };

      return res.json({ totals, roles: getTenantRoleCatalog() });
    } catch (error) {
      console.error("Get tenant admin overview error:", error);
      return res.status(500).json({ error: "Failed to fetch admin overview" });
    }
  }

  async listMembers(req, res) {
    try {
      const tenantId = req.tenantId;
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;
      const role = String(req.query.role || "").trim();
      const isActive = String(req.query.is_active || "").trim();
      const search = String(req.query.search || "")
        .trim()
        .toLowerCase();

      const membershipFilter = { tenant_id: tenantId };
      if (role) membershipFilter.role = role;
      if (isActive === "true" || isActive === "false") {
        membershipFilter.is_active = isActive === "true";
      }

      const membershipQuery = TenantAdminMembership.find(membershipFilter).sort(
        {
          createdAt: -1,
        },
      );

      if (!search) {
        membershipQuery.skip(skip).limit(limit);
      }

      const [memberships, total, tenant] = await Promise.all([
        membershipQuery.lean(),
        TenantAdminMembership.countDocuments(membershipFilter),
        Tenant.findById(tenantId).select("name slug").lean(),
      ]);

      const adminIds = memberships.map((membership) => membership.admin_id);
      const admins = await Admin.find({ _id: { $in: adminIds } })
        .select("-password_hash -reset_password_code -reset_password_expires")
        .lean();

      const adminMap = new Map(
        admins.map((admin) => [admin._id.toString(), admin]),
      );

      let items = memberships
        .map((membership) => {
          const admin = adminMap.get(membership.admin_id.toString());
          if (!admin) return null;
          return serializeMembership(membership, admin);
        })
        .filter(Boolean);

      if (search) {
        items = items.filter((item) =>
          [item.full_name, item.email, item.role].some((value) =>
            String(value).toLowerCase().includes(search),
          ),
        );
      }

      const filteredTotal = search ? items.length : total;
      const paginatedItems = search ? items.slice(skip, skip + limit) : items;

      return res.json({
        tenant,
        members: paginatedItems,
        pagination: {
          total: filteredTotal,
          page,
          limit,
          pages: Math.max(Math.ceil(filteredTotal / limit), 1),
        },
      });
    } catch (error) {
      console.error("List tenant admins error:", error);
      return res.status(500).json({ error: "Failed to fetch tenant admins" });
    }
  }

  async getMemberById(req, res) {
    try {
      const { id } = req.params;
      const membership = await TenantAdminMembership.findOne({
        _id: id,
        tenant_id: req.tenantId,
      }).lean();

      if (!membership) {
        return res
          .status(404)
          .json({ error: "Tenant admin membership not found" });
      }

      const admin = await Admin.findById(membership.admin_id)
        .select("-password_hash -reset_password_code -reset_password_expires")
        .lean();

      if (!admin) {
        return res.status(404).json({ error: "Admin account not found" });
      }

      return res.json({
        member: serializeMembership(membership, admin),
      });
    } catch (error) {
      console.error("Get tenant admin member error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch tenant admin member" });
    }
  }

  async createMember(req, res) {
    try {
      const { email, full_name, role } = req.body;
      const normalizedEmail = String(email).trim().toLowerCase();
      const targetRole = role || "admin";
      const tempPassword = constants.defaultPassword;

      if (!isSupportedTenantRole(targetRole)) {
        return res.status(400).json({ error: "Invalid tenant role" });
      }

      const canManageTenant = req.adminMembership?.role === "owner";
      if (targetRole === "owner" && !canManageTenant) {
        return res.status(403).json({
          error: "Only the current tenant owner can assign the owner role",
        });
      }

      let admin = await Admin.findOne({ email: normalizedEmail });

      if (admin && admin.role === "super_admin") {
        return res.status(409).json({
          error: "Cannot attach a super admin as a tenant admin user",
        });
      }

      if (!admin) {
        // New admin account - always use generated/provided password
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        admin = await Admin.create({
          email: normalizedEmail,
          password_hash: passwordHash,
          full_name: String(full_name).trim(),
          role: "admin",
          is_active: true,
        });
      } else if (full_name) {
        admin.full_name = String(full_name).trim();
        await admin.save();
      }

      const existingMembership = await TenantAdminMembership.findOne({
        tenant_id: req.tenantId,
        admin_id: admin._id,
      });

      if (existingMembership) {
        return res.status(409).json({
          error: "This admin is already assigned to the active tenant",
        });
      }

      const quotaStatus = await getTenantQuotaStatus(
        req.tenant,
        req.tenantId,
        "admins",
        1,
      );

      if (!quotaStatus.allowed) {
        return res.status(403).json({
          error: buildQuotaErrorMessage(quotaStatus, "active admin users"),
          code: "PLAN_LIMIT_REACHED",
          quota: quotaStatus,
        });
      }

      const membership = await TenantAdminMembership.create({
        tenant_id: req.tenantId,
        admin_id: admin._id,
        role: targetRole,
        permissions: getDefaultPermissionsForRole(targetRole),
        is_active: true,
      });

      const payload = await buildMembershipResponse(membership);

      emailService
        .sendAdminWelcome({
          to: admin.email,
          fullName: admin.full_name,
          temporaryPassword: tempPassword,
          tenant: req.tenant || null,
          roleLabel: targetRole,
          platformScope: false,
        })
        .catch((err) => {
          console.error("Failed to send tenant admin welcome email:", err);
        });

      return res.status(201).json({
        message: "Tenant admin created successfully",
        member: payload,
      });
    } catch (error) {
      console.error("Create tenant admin member error:", error);
      return res.status(500).json({ error: "Failed to create tenant admin" });
    }
  }

  async updateMember(req, res) {
    try {
      const { id } = req.params;
      const { full_name, role, is_active } = req.body;

      const membership = await TenantAdminMembership.findOne({
        _id: id,
        tenant_id: req.tenantId,
      });

      if (!membership) {
        return res
          .status(404)
          .json({ error: "Tenant admin membership not found" });
      }

      if (
        membership.admin_id.toString() === req.adminId.toString() &&
        is_active === false
      ) {
        return res.status(400).json({
          error: "Cannot deactivate your own tenant membership",
        });
      }

      const admin = await Admin.findById(membership.admin_id);
      if (!admin) {
        return res.status(404).json({ error: "Admin account not found" });
      }

      if (full_name !== undefined) {
        admin.full_name = String(full_name).trim();
        await admin.save();
      }

      if (role !== undefined) {
        if (!isSupportedTenantRole(role)) {
          return res.status(400).json({ error: "Invalid tenant role" });
        }

        const canManageTenant = req.adminMembership?.role === "owner";
        if (role === "owner" && !canManageTenant) {
          return res.status(403).json({
            error: "Only the current tenant owner can assign the owner role",
          });
        }

        membership.role = role;
        membership.permissions = getDefaultPermissionsForRole(role);
      }

      if (is_active !== undefined) {
        membership.is_active = Boolean(is_active);
      }

      await membership.save();

      return res.json({
        message: "Tenant admin updated successfully",
        member: serializeMembership(membership.toObject(), admin.toObject()),
      });
    } catch (error) {
      console.error("Update tenant admin member error:", error);
      return res.status(500).json({ error: "Failed to update tenant admin" });
    }
  }

  async deleteMember(req, res) {
    try {
      const { id } = req.params;
      const { permanent = "false" } = req.query;

      const membership = await TenantAdminMembership.findOne({
        _id: id,
        tenant_id: req.tenantId,
      });

      if (!membership) {
        return res
          .status(404)
          .json({ error: "Tenant admin membership not found" });
      }

      if (membership.admin_id.toString() === req.adminId.toString()) {
        return res.status(400).json({
          error: "Cannot remove your own tenant membership",
        });
      }

      const canManageTenant = req.adminMembership?.role === "owner";
      if (membership.role === "owner" && !canManageTenant) {
        return res.status(403).json({
          error: "Only the current tenant owner can remove an owner account",
        });
      }

      if (permanent === "true") {
        await TenantAdminMembership.deleteOne({ _id: membership._id });
        return res.json({ message: "Tenant admin membership removed" });
      }

      membership.is_active = false;
      await membership.save();

      return res.json({ message: "Tenant admin membership deactivated" });
    } catch (error) {
      console.error("Delete tenant admin member error:", error);
      return res.status(500).json({ error: "Failed to remove tenant admin" });
    }
  }
}

module.exports = new TenantAdminController();
