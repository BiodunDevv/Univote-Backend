jest.mock("../models/Tenant", () => ({
  findOne: jest.fn(),
}));

const Tenant = require("../models/Tenant");
const {
  resolveTenantContext,
  requireTenantContext,
  getTenantSlugFromHost,
  normalizeSlug,
} = require("./tenantContext");

describe("tenantContext middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DEFAULT_TENANT_SLUG;
    delete process.env.APP_ROOT_DOMAIN;
  });

  it("normalizes tenant slugs safely", () => {
    expect(normalizeSlug("  Demo-University ")).toBe("demo-university");
    expect(normalizeSlug("alpha_beta")).toBe("alphabeta");
  });

  it("resolves tenant from x-tenant-slug header", async () => {
    const req = {
      headers: {
        "x-tenant-slug": "Bowen-University",
        host: "localhost:5000",
      },
    };
    const next = jest.fn();

    Tenant.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "tenant-1",
        slug: "bowen-university",
        status: "active",
        is_active: true,
      }),
    });

    await resolveTenantContext(req, {}, next);

    expect(Tenant.findOne).toHaveBeenCalledWith({
      slug: "bowen-university",
      is_active: true,
    });
    expect(req.tenantSlug).toBe("bowen-university");
    expect(req.tenantId).toBe("tenant-1");
    expect(req.tenantFilter).toEqual({ tenant_id: "tenant-1" });
    expect(next).toHaveBeenCalledWith();
  });

  it("resolves tenant slug from localhost subdomains", () => {
    expect(getTenantSlugFromHost("bowen-demo.localhost:5000")).toBe("bowen-demo");
    expect(getTenantSlugFromHost("www.localhost:5000")).toBeNull();
  });

  it("falls back to default tenant slug", async () => {
    process.env.DEFAULT_TENANT_SLUG = "default-campus";

    const req = { headers: { host: "localhost:5000" } };
    const next = jest.fn();

    Tenant.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "tenant-2",
        slug: "default-campus",
        status: "active",
        is_active: true,
      }),
    });

    await resolveTenantContext(req, {}, next);

    expect(req.tenantSlug).toBe("default-campus");
    expect(req.tenantId).toBe("tenant-2");
    expect(next).toHaveBeenCalledWith();
  });

  it("requireTenantContext blocks missing tenant", () => {
    const req = { tenant: null };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    requireTenantContext(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
