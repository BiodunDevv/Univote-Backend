const { buildEmailShell } = require("../shell");
const {
  renderKeyValueRows,
  renderList,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");
const { COLORS, FONT_SANS } = require("../theme");

function buildVoteConfirmationEmail({
  branding,
  student,
  session,
  votes,
  ballotUrl = null,
}) {
  const voteList = (votes || []).map(
    (vote) => `${vote.position}: ${vote.candidate_name}`,
  );
  const recipientName = student.full_name || "student";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(recipientName)}, your ballot has been accepted and recorded. This message serves as your voting receipt.
    </p>
    ${renderSection(
      "Ballot receipt",
      renderKeyValueRows([
        { label: "Participant", value: student.full_name || "Student" },
        { label: "Email", value: student.email || "Registered email" },
        { label: "Election", value: session.title },
        { label: "Recorded at", value: formatDateTime(Date.now()) },
      ]),
    )}
    ${
      voteList.length
        ? renderSection("Selected candidates", renderList(voteList))
        : ""
    }
    ${renderSection(
      "Privacy notice",
      renderNoticeBox(
        "Your selections are private and encrypted. The integrity of your ballot is protected and cannot be altered after submission.",
        "success",
      ),
    )}
  `;

  return {
    subject: `Vote confirmed — ${session.title}`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `Your vote for ${session.title} has been recorded. Keep this as your receipt.`,
      badge: "Vote recorded",
      headline: "Your vote has been recorded",
      intro: `This is your official ballot receipt for the ${escapeHtml(session.title)} election.`,
      statusStripHtml: renderSummaryStrip([
        { label: "Election", value: session.title },
        { label: "Recorded", value: formatDateTime(Date.now()) },
      ]),
      bodyHtml,
      cta: ballotUrl
        ? { label: "View submitted ballot", url: ballotUrl }
        : null,
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
  const orgName = branding.appName || "your university";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      The ${escapeHtml(session.title)} election has concluded and the official results are now available on the ${escapeHtml(orgName)} portal.
    </p>
    ${
      winners.length
        ? renderSection(
            "Winning candidates",
            renderList(
              winners.map((winner) => `${winner.position}: ${winner.name}`),
            ),
          )
        : renderSection(
            "Election outcome",
            `<p class="univote-body-text" style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">The complete results and tallies are available in your portal.</p>`,
          )
    }
    ${renderSection(
      "Participation",
      renderNoticeBox(
        `${totalVotes > 0 ? `<strong>${totalVotes.toLocaleString()}</strong> votes were counted in this election.` : "Final vote counts are visible in the results page."} Thank you for participating.`,
        "success",
      ),
    )}
  `;

  return {
    subject: `Results available — ${session.title}`,
    html: buildEmailShell({
      branding,
      variant: "order",
      preheader: `Results are now live for ${session.title}. View the official outcome in your portal.`,
      badge: "Results published",
      headline: "Election results are now live",
      intro: `The ${escapeHtml(session.title)} election has ended and the official results have been published.`,
      statusStripHtml: renderSummaryStrip([
        { label: "Election", value: session.title },
        { label: "Published", value: formatDateTime(Date.now()) },
        ...(totalVotes > 0
          ? [{ label: "Total votes", value: String(totalVotes) }]
          : []),
      ]),
      bodyHtml,
      cta: resultsUrl ? { label: "View results", url: resultsUrl } : null,
    }),
  };
}

module.exports = {
  buildResultAnnouncementEmail,
  buildVoteConfirmationEmail,
};
