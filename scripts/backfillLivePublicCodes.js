require("dotenv").config();
const connectDB = require("../src/config/database");
const VotingSession = require("../src/models/VotingSession");
const {
  formatLivePublicCode,
} = require("../src/services/liveSessionService");

async function backfillLivePublicCodes() {
  await connectDB();

  const tenantGroups = await VotingSession.aggregate([
    {
      $group: {
        _id: "$tenant_id",
      },
    },
  ]);

  let updated = 0;

  for (const group of tenantGroups) {
    const tenantId = group._id || null;
    const tenantFilter = { tenant_id: tenantId };
    const sessions = await VotingSession.find({
      ...tenantFilter,
      $or: [
        { live_public_code: { $exists: false } },
        { live_public_code: null },
        { live_sequence: { $exists: false } },
        { live_sequence: null },
      ],
    })
      .sort({ createdAt: 1, _id: 1 })
      .select("_id live_public_code live_sequence")
      .lean();

    const latest = await VotingSession.findOne({
      ...tenantFilter,
      live_sequence: { $ne: null },
    })
      .sort({ live_sequence: -1 })
      .select("live_sequence")
      .lean();

    let sequence = Number(latest?.live_sequence || 0);

    for (const session of sessions) {
      sequence += 1;
      const live_public_code = formatLivePublicCode(sequence);

      await VotingSession.updateOne(
        { _id: session._id },
        {
          $set: {
            live_sequence: sequence,
            live_public_code,
          },
        },
      );

      updated += 1;
      console.log(
        `Assigned ${live_public_code} to session ${session._id.toString()}`,
      );
    }
  }

  console.log(`Backfill complete. Updated ${updated} session(s).`);
}

backfillLivePublicCodes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
