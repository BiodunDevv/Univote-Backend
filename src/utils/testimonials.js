function serializeTestimonial(testimonial) {
  if (!testimonial) return null;

  return {
    id: testimonial._id,
    tenant_id: testimonial.tenant_id || null,
    author_name: testimonial.author_name,
    author_role: testimonial.author_role,
    institution_name: testimonial.institution_name,
    quote: testimonial.quote,
    avatar_url: testimonial.avatar_url || null,
    rating: testimonial.rating || 5,
    source: testimonial.source || "platform",
    status: testimonial.status || "draft",
    highlighted: Boolean(testimonial.highlighted),
    sort_order: testimonial.sort_order || 0,
    published_at: testimonial.published_at || null,
    rejected_at: testimonial.rejected_at || null,
    createdAt: testimonial.createdAt || null,
    updatedAt: testimonial.updatedAt || null,
  };
}

module.exports = {
  serializeTestimonial,
};
