import React from '../../snowpack/pkg/react.js';

const el = React.createElement;

function decodeEntityGuid(guid) {
  if (!guid || typeof guid !== 'string') return null;
  try {
    var decoded = atob(guid);
    var parts = decoded.split('|');
    if (parts.length === 4 && /^\d+$/.test(parts[0])) {
      return { accountId: parts[0], domain: parts[1], type: parts[2], domainId: parts[3] };
    }
  } catch (e) {}
  return null;
}

const TableRow = (key, value, linkOptions) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  var valueCell;
  if (linkOptions) {
    var linkHref = linkOptions.href || value;
    valueCell = el("td", null, el("a", {
      className: "DebugMode-link",
      href: linkHref,
      target: "_blank",
      rel: "noopener noreferrer"
    }, linkOptions.text || value));
  } else {
    valueCell = el("td", null, String(value));
  }
  return el("tr", { key: key }, el("td", null, key), valueCell);
};

const KeyValueTable = (rows) => {
  var filteredRows = rows.filter(function (r) { return r !== null; });
  if (filteredRows.length === 0) return null;
  return el("table", { className: "DebugMode-table" },
    el("thead", null,
      el("tr", null, el("th", null, "Key"), el("th", null, "Value"))
    ),
    el("tbody", null, filteredRows)
  );
};

const DebugInfoPage = (props) => {
  const {
    debugPlatformInfo,
    debugNerdpacks,
    debugCurrentNerdletId,
    debugEntityGuid
  } = props;

  const nerdpackName = debugCurrentNerdletId ? debugCurrentNerdletId.split('.')[0] : null;
  const nerdpacks = Array.isArray(debugNerdpacks) ? debugNerdpacks : [];
  const currentNerdpack = nerdpackName && nerdpacks.length > 0
    ? nerdpacks.find(function (np) {
        return np.id === nerdpackName
          || np.nerdpackId === nerdpackName
          || (np.displayName && np.displayName.toLowerCase().replace(/\s+/g, '-') === nerdpackName);
      })
    : null;

  // Build repo link
  var repoLink = null;
  if (currentNerdpack && currentNerdpack.repositoryUrl) {
    var url = currentNerdpack.repositoryUrl;
    // Convert SSH git URLs (git@host:org/repo.git) to HTTPS
    var sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch) {
      url = 'https://' + sshMatch[1] + '/' + sshMatch[2];
    } else if (url.indexOf('://') === -1) {
      url = 'https://' + url;
    }
    // Strip trailing .git for clean browser URLs
    url = url.replace(/\.git$/, '');
    if (url.indexOf('github.com') !== -1) {
      repoLink = { href: url, text: "View it on GitHub" };
    } else if (url.indexOf('source.datanerd.us') !== -1) {
      repoLink = { href: url, text: "View it on GHE" };
    } else {
      repoLink = { href: url, text: url };
    }
  }

  var decodedGuid = debugEntityGuid ? decodeEntityGuid(debugEntityGuid) : null;

  return el("div", { className: "DebugMode-container" },

    // Associated Teams
    currentNerdpack && currentNerdpack.teams && currentNerdpack.teams.length > 0 && [
      el("h2", { className: "DebugMode-heading", key: "teams-heading" }, "Associated Teams"),
      currentNerdpack.teams.map(function (team) {
        return el(React.Fragment, { key: team.id },
          el("h3", { className: "DebugMode-subheading" }, team.name),
          KeyValueTable([
            team.teamstoreUrl ? TableRow("Team Store", team.name, { href: team.teamstoreUrl, text: team.name }) : null,
            team.slack ? TableRow("Slack Channel", team.slack, team.slackUrl ? { href: team.slackUrl, text: team.slack } : null) : null
          ])
        );
      })
    ],

    // Platform Info
    el("h2", { className: "DebugMode-heading" }, "Platform Info"),
    debugPlatformInfo
      ? KeyValueTable([
          TableRow("Version", debugPlatformInfo.version),
          TableRow("Platform Version", debugPlatformInfo.platformVersion),
          TableRow("Environment", debugPlatformInfo.env),
          TableRow("Region", debugPlatformInfo.region),
          TableRow("User ID", debugPlatformInfo.userId),
          TableRow("Account ID", debugPlatformInfo.accountId)
        ])
      : el("div", { className: "DebugMode-empty" }, "Waiting for platform info..."),

    // Debug Info
    el("h2", { className: "DebugMode-heading" }, "Debug Info"),
    debugCurrentNerdletId
      ? KeyValueTable([
          TableRow("Full Id", debugCurrentNerdletId),
          TableRow("Nerdpack Id", nerdpackName),
          currentNerdpack ? TableRow("Nerdpack uuid", currentNerdpack.nerdpackId || nerdpackName) : null,
          debugEntityGuid ? TableRow("Entity GUID", debugEntityGuid) : null,
          decodedGuid ? TableRow("  Account ID", decodedGuid.accountId) : null,
          decodedGuid ? TableRow("  Domain", decodedGuid.domain) : null,
          decodedGuid ? TableRow("  Type", decodedGuid.type) : null,
          decodedGuid ? TableRow("  Domain ID", decodedGuid.domainId) : null,
          currentNerdpack ? TableRow("Origin", "Remote (Artifact registry)") : null,
          currentNerdpack && repoLink ? TableRow("Repo", currentNerdpack.repositoryUrl, repoLink) : null,
          currentNerdpack ? TableRow("Nerdpack Version", currentNerdpack.version) : null,
          currentNerdpack ? TableRow("SDK Version", currentNerdpack.sdkVersion) : null,
          currentNerdpack ? TableRow("CLI Version", currentNerdpack.cliVersion) : null
        ].concat(
          !currentNerdpack && nerdpacks.length === 0
            ? [el("tr", { key: "_loading" }, el("td", { colSpan: 2, style: { fontStyle: "italic", color: "#999" } }, "Loading nerdpack metadata..."))]
            : [],
          !currentNerdpack && nerdpacks.length > 0
            ? [el("tr", { key: "_notfound" }, el("td", { colSpan: 2, style: { fontStyle: "italic", color: "#999" } }, "No nerdpack metadata found for \"" + nerdpackName + "\""))]
            : []
        ))
      : el("div", { className: "DebugMode-empty" }, "Waiting for nerdlet info...")
  );
};

export default /*#__PURE__*/React.memo(DebugInfoPage);
