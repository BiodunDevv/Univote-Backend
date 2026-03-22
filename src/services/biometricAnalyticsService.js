const VerificationLog = require("../models/VerificationLog");
const { getTenantScopedFilter, prependTenantMatch } = require("../utils/tenantScope");

function buildVerificationLogFilter(req, filters = {}) {
  const query = getTenantScopedFilter(req, {});

  if (filters.session_id) {
    query.session_id = filters.session_id;
  }
  if (filters.result) {
    query.result = filters.result;
  }
  if (filters.failure_reason) {
    query.failure_reason = filters.failure_reason;
  }
  if (filters.start_date || filters.end_date) {
    query.timestamp = {};
    if (filters.start_date) {
      query.timestamp.$gte = new Date(filters.start_date);
    }
    if (filters.end_date) {
      query.timestamp.$lte = new Date(filters.end_date);
    }
  }
  if (filters.review_state === "reviewed") {
    query.is_genuine_attempt = { $in: [true, false] };
  }
  if (filters.review_state === "pending") {
    query.is_genuine_attempt = null;
  }

  return query;
}

async function createVerificationLog(req, payload = {}) {
  const log = await VerificationLog.create({
    ...getTenantScopedFilter(req, {}),
    user_id: payload.user_id || null,
    session_id: payload.session_id || null,
    confidence_score:
      typeof payload.confidence_score === "number"
        ? payload.confidence_score
        : null,
    threshold_used:
      typeof payload.threshold_used === "number" ? payload.threshold_used : null,
    result: payload.result === "accepted" ? "accepted" : "rejected",
    failure_reason: payload.failure_reason || null,
    is_genuine_attempt:
      typeof payload.is_genuine_attempt === "boolean"
        ? payload.is_genuine_attempt
        : null,
    provider: payload.provider || "facepp",
    device_id: payload.device_id || null,
    ip_address: payload.ip_address || null,
    geo_location:
      payload.geo_location &&
      typeof payload.geo_location.lat === "number" &&
      typeof payload.geo_location.lng === "number"
        ? {
            lat: payload.geo_location.lat,
            lng: payload.geo_location.lng,
          }
        : {
            lat: null,
            lng: null,
          },
    image_url: payload.image_url || null,
    meta: payload.meta || undefined,
    timestamp: payload.timestamp || new Date(),
  });

  return log;
}

async function getVerificationMetrics(req, filters = {}) {
  const match = buildVerificationLogFilter(req, filters);

  const [summaryResult, trendResult, confidenceTrendResult, recentReasons] =
    await Promise.all([
      VerificationLog.aggregate(
        prependTenantMatch(req, [
          { $match: match },
          {
            $group: {
              _id: null,
              total_attempts: { $sum: 1 },
              accepted_attempts: {
                $sum: { $cond: [{ $eq: ["$result", "accepted"] }, 1, 0] },
              },
              rejected_attempts: {
                $sum: { $cond: [{ $eq: ["$result", "rejected"] }, 1, 0] },
              },
              reviewed_attempts: {
                $sum: {
                  $cond: [{ $ne: ["$is_genuine_attempt", null] }, 1, 0],
                },
              },
              unlabeled_attempts: {
                $sum: {
                  $cond: [{ $eq: ["$is_genuine_attempt", null] }, 1, 0],
                },
              },
              false_accepts: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$result", "accepted"] },
                        { $eq: ["$is_genuine_attempt", false] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              false_rejects: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$result", "rejected"] },
                        { $eq: ["$is_genuine_attempt", true] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              correct_accepts: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$result", "accepted"] },
                        { $eq: ["$is_genuine_attempt", true] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              correct_rejects: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$result", "rejected"] },
                        { $eq: ["$is_genuine_attempt", false] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              total_genuine_attempts: {
                $sum: {
                  $cond: [{ $eq: ["$is_genuine_attempt", true] }, 1, 0],
                },
              },
              total_impostor_attempts: {
                $sum: {
                  $cond: [{ $eq: ["$is_genuine_attempt", false] }, 1, 0],
                },
              },
            },
          },
        ]),
      ),
      VerificationLog.aggregate(
        prependTenantMatch(req, [
          { $match: match },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              accepted: {
                $sum: { $cond: [{ $eq: ["$result", "accepted"] }, 1, 0] },
              },
              rejected: {
                $sum: { $cond: [{ $eq: ["$result", "rejected"] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ),
      VerificationLog.aggregate(
        prependTenantMatch(req, [
          { $match: { ...match, confidence_score: { $ne: null } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              average_confidence: { $avg: "$confidence_score" },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ),
      VerificationLog.aggregate(
        prependTenantMatch(req, [
          { $match: { ...match, failure_reason: { $ne: null } } },
          {
            $group: {
              _id: "$failure_reason",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
      ),
    ]);

  const summary = summaryResult[0] || {
    total_attempts: 0,
    accepted_attempts: 0,
    rejected_attempts: 0,
    reviewed_attempts: 0,
    unlabeled_attempts: 0,
    false_accepts: 0,
    false_rejects: 0,
    correct_accepts: 0,
    correct_rejects: 0,
    total_genuine_attempts: 0,
    total_impostor_attempts: 0,
  };

  const far =
    summary.total_impostor_attempts > 0
      ? summary.false_accepts / summary.total_impostor_attempts
      : 0;
  const frr =
    summary.total_genuine_attempts > 0
      ? summary.false_rejects / summary.total_genuine_attempts
      : 0;
  const accuracy =
    summary.reviewed_attempts > 0
      ? (summary.correct_accepts + summary.correct_rejects) /
        summary.reviewed_attempts
      : 0;

  return {
    summary: {
      ...summary,
      far,
      frr,
      accuracy,
    },
    trends: trendResult.map((entry) => ({
      date: entry._id,
      accepted: entry.accepted,
      rejected: entry.rejected,
    })),
    confidence_trend: confidenceTrendResult.map((entry) => ({
      date: entry._id,
      average_confidence: Number((entry.average_confidence || 0).toFixed(2)),
    })),
    failure_reasons: recentReasons.map((entry) => ({
      reason: entry._id,
      count: entry.count,
    })),
  };
}

module.exports = {
  buildVerificationLogFilter,
  createVerificationLog,
  getVerificationMetrics,
};
