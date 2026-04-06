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
  if (filters.decision_source) {
    query.decision_source = filters.decision_source;
  }
  if (filters.liveness_status) {
    query.liveness_status = filters.liveness_status;
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
    liveness_session_id: payload.liveness_session_id || null,
    liveness_status: payload.liveness_status || null,
    liveness_confidence:
      typeof payload.liveness_confidence === "number"
        ? payload.liveness_confidence
        : null,
    liveness_threshold:
      typeof payload.liveness_threshold === "number"
        ? payload.liveness_threshold
        : null,
    compare_confidence:
      typeof payload.compare_confidence === "number"
        ? payload.compare_confidence
        : null,
    compare_threshold:
      typeof payload.compare_threshold === "number"
        ? payload.compare_threshold
        : null,
    matched_face_id: payload.matched_face_id || null,
    decision_source: payload.decision_source || null,
    fail_streak:
      typeof payload.fail_streak === "number" ? payload.fail_streak : 0,
    lockout_triggered: payload.lockout_triggered === true,
    lockout_expires_at: payload.lockout_expires_at || null,
    result: payload.result === "accepted" ? "accepted" : "rejected",
    failure_reason: payload.failure_reason || null,
    is_genuine_attempt:
      typeof payload.is_genuine_attempt === "boolean"
        ? payload.is_genuine_attempt
        : null,
    reviewed_by: payload.reviewed_by || null,
    reviewed_at: payload.reviewed_at || null,
    review_note: payload.review_note || null,
    provider: payload.provider || "aws_rekognition",
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
              liveness_passed_attempts: {
                $sum: {
                  $cond: [{ $eq: ["$liveness_status", "SUCCEEDED"] }, 1, 0],
                },
              },
              liveness_failed_attempts: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$failure_reason", "LIVENESS_FAILED"] },
                        { $eq: ["$failure_reason", "LIVENESS_SESSION_EXPIRED"] },
                        { $eq: ["$failure_reason", "LIVENESS_INCOMPLETE"] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              lockout_count: {
                $sum: { $cond: [{ $eq: ["$lockout_triggered", true] }, 1, 0] },
              },
              compare_success_count: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$result", "accepted"] },
                        { $ne: ["$compare_confidence", null] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              compare_reject_count: {
                $sum: {
                  $cond: [{ $eq: ["$failure_reason", "LOW_CONFIDENCE"] }, 1, 0],
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
              lockouts: {
                $sum: {
                  $cond: [{ $eq: ["$lockout_triggered", true] }, 1, 0],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ),
      VerificationLog.aggregate(
        prependTenantMatch(req, [
          { $match: { ...match, compare_confidence: { $ne: null } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              average_compare_confidence: { $avg: "$compare_confidence" },
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
    liveness_passed_attempts: 0,
    liveness_failed_attempts: 0,
    lockout_count: 0,
    compare_success_count: 0,
    compare_reject_count: 0,
  };

  const totalAttempts = summary.total_attempts || 0;
  const totalRejected = summary.rejected_attempts || 0;
  const totalAccepted = summary.accepted_attempts || 0;
  const totalLivenessObserved =
    summary.liveness_passed_attempts + summary.liveness_failed_attempts;
  const compareObserved =
    summary.compare_success_count + summary.compare_reject_count;

  const passRate = totalAttempts > 0 ? totalAccepted / totalAttempts : 0;
  const rejectRate = totalAttempts > 0 ? totalRejected / totalAttempts : 0;
  const livenessPassRate =
    totalLivenessObserved > 0
      ? summary.liveness_passed_attempts / totalLivenessObserved
      : 0;
  const livenessFailRate =
    totalLivenessObserved > 0
      ? summary.liveness_failed_attempts / totalLivenessObserved
      : 0;

  // These are system-outcome proxy estimates, not ground-truth biometric benchmarks.
  const far = compareObserved > 0 ? totalAccepted / compareObserved : 0;
  const frr = compareObserved > 0 ? summary.compare_reject_count / compareObserved : 0;
  const accuracy = totalAttempts > 0 ? totalAccepted / totalAttempts : 0;

  return {
    summary: {
      ...summary,
      pass_rate: passRate,
      reject_rate: rejectRate,
      liveness_pass_rate: livenessPassRate,
      liveness_fail_rate: livenessFailRate,
      proxy_far: far,
      proxy_frr: frr,
      proxy_accuracy: accuracy,
      metric_mode: "operational_estimate",
    },
    trends: trendResult.map((entry) => ({
      date: entry._id,
      accepted: entry.accepted,
      rejected: entry.rejected,
      lockouts: entry.lockouts,
    })),
    confidence_trend: confidenceTrendResult.map((entry) => ({
      date: entry._id,
      average_compare_confidence: Number(entry.average_compare_confidence || 0),
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
