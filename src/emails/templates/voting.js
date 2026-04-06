const { buildEmailShell } = require("../shell");
const {
  renderKeyValueRows,
  renderList,
  renderSection,
  renderSummaryStrip,
} = require("../fragments");
const { formatDateTime } = require("../utils");

function buildVoteConfirmationEmail({ branding, student, session, votes }) {
  const voteList = (votes || []).map(
    (vote) => `${vote.position}: ${vote.candidate_name}`,
  );

  return {
    subject: `Vote confirmed - ${session.title}`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `Your vote for ${session.title} has been recorded.`,
      badge: "Vote recorded",
      headline: `Vote confirmed for ${session.title}`,
      intro:
        "This is your transaction receipt for the ballot that was just accepted.",
      statusStripHtml: renderSummaryStrip([
        { label: "Session", value: session.title },
        { label: "Recorded", value: formatDateTime(Date.now()) },
      ]),
      bodyHtml: `
        ${renderSection(
          "Ballot receipt",
          renderKeyValueRows([
            { label: "Participant", value: student.full_name },
            { label: "Session", value: session.title },
            { label: "Recorded", value: formatDateTime(Date.now()) },
          ]),
        )}
        ${voteList.length ? renderSection("Selected candidates", renderList(voteList)) : ""}
      `,
    }),
  };
}

function buildResultAnnouncementEmail({
  branding,
  session,
  resultsUrl,
  winners = [],
  totalVotes = 0,
}) {
  return {
    subject: `Results available - ${session.title}`,
    html: buildEmailShell({
      branding,
      variant: "order",
      preheader: `Results are live for ${session.title}.`,
      badge: "Results published",
      headline: `Results are live for ${session.title}`,
      intro:
        "The session has been completed and the official outcome is now available.",
      statusStripHtml: renderSummaryStrip([
        { label: "Session", value: session.title },
        { label: "Published", value: formatDateTime(Date.now()) },
        { label: "Accepted votes", value: String(totalVotes) },
      ]),
      bodyHtml: winners.length
        ? renderSection(
            "Winning candidates",
            renderList(winners.map((winner) => `${winner.position}: ${winner.name}`)),
          )
        : renderSection(
            "Outcome",
            `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">The session result is available in your portal.</p>`,
          ),
      cta: resultsUrl ? { label: "View results", url: resultsUrl } : null,
    }),
  };
}

module.exports = {
  buildResultAnnouncementEmail,
  buildVoteConfirmationEmail,
};
