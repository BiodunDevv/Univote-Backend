const Testimonial = require("../models/Testimonial");
const { serializeTestimonial } = require("../utils/testimonials");

class PlatformTestimonialController {
  async listTestimonials(req, res) {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;
      const search = String(req.query.search || "").trim();
      const status = String(req.query.status || "").trim();

      const filter = {};

      if (search) {
        filter.$text = { $search: search };
      }

      if (status) {
        filter.status = status;
      }

      const [testimonials, total] = await Promise.all([
        Testimonial.find(filter)
          .sort(search ? { score: { $meta: "textScore" }, createdAt: -1 } : { highlighted: -1, sort_order: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Testimonial.countDocuments(filter),
      ]);

      return res.json({
        testimonials: testimonials.map(serializeTestimonial),
        page,
        pages: Math.max(Math.ceil(total / limit), 1),
        total,
      });
    } catch (error) {
      console.error("List platform testimonials error:", error);
      return res.status(500).json({ error: "Failed to fetch testimonials" });
    }
  }

  async createTestimonial(req, res) {
    try {
      const testimonial = await Testimonial.create({
        tenant_id: req.body.tenant_id || null,
        author_name: String(req.body.author_name).trim(),
        author_role: String(req.body.author_role).trim(),
        institution_name: String(req.body.institution_name).trim(),
        quote: String(req.body.quote).trim(),
        avatar_url: req.body.avatar_url ? String(req.body.avatar_url).trim() : null,
        rating: Number(req.body.rating || 5),
        source: req.body.source || "platform",
        status: req.body.status || "draft",
        highlighted: Boolean(req.body.highlighted),
        sort_order:
          req.body.sort_order !== undefined && req.body.sort_order !== null
            ? Number(req.body.sort_order)
            : 0,
        approved_by_admin_id:
          req.body.status === "published" ? req.adminId || null : null,
        published_at: req.body.status === "published" ? new Date() : null,
      });

      return res.status(201).json({
        message: "Testimonial created successfully",
        testimonial: serializeTestimonial(testimonial),
      });
    } catch (error) {
      console.error("Create testimonial error:", error);
      return res.status(500).json({ error: "Failed to create testimonial" });
    }
  }

  async updateTestimonial(req, res) {
    try {
      const testimonial = await Testimonial.findById(req.params.id);
      if (!testimonial) {
        return res.status(404).json({ error: "Testimonial not found" });
      }

      const {
        author_name,
        author_role,
        institution_name,
        quote,
        avatar_url,
        rating,
        status,
        highlighted,
        sort_order,
      } = req.body;

      if (author_name !== undefined) testimonial.author_name = String(author_name).trim();
      if (author_role !== undefined) testimonial.author_role = String(author_role).trim();
      if (institution_name !== undefined) {
        testimonial.institution_name = String(institution_name).trim();
      }
      if (quote !== undefined) testimonial.quote = String(quote).trim();
      if (avatar_url !== undefined) {
        testimonial.avatar_url = avatar_url ? String(avatar_url).trim() : null;
      }
      if (rating !== undefined) testimonial.rating = Number(rating);
      if (highlighted !== undefined) testimonial.highlighted = Boolean(highlighted);
      if (sort_order !== undefined) testimonial.sort_order = Number(sort_order) || 0;

      if (status !== undefined) {
        testimonial.status = status;

        if (status === "published") {
          testimonial.published_at = testimonial.published_at || new Date();
          testimonial.rejected_at = null;
          testimonial.approved_by_admin_id = req.adminId || testimonial.approved_by_admin_id;
        }

        if (status === "rejected") {
          testimonial.rejected_at = new Date();
        }

        if (status !== "published") {
          testimonial.approved_by_admin_id =
            status === "rejected" ? testimonial.approved_by_admin_id : null;
        }
      }

      await testimonial.save();

      return res.json({
        message: "Testimonial updated successfully",
        testimonial: serializeTestimonial(testimonial),
      });
    } catch (error) {
      console.error("Update testimonial error:", error);
      return res.status(500).json({ error: "Failed to update testimonial" });
    }
  }
}

module.exports = new PlatformTestimonialController();
