export let PageName;

(function (PageName) {
  PageName["URL_PARAMETERS"] = "URL_PARAMETERS";
  PageName["GRAPHQL_REQUESTS"] = "GRAPHQL_REQUESTS";
  PageName["NRQL_REQUESTS"] = "NRQL_REQUESTS";
  PageName["DEBUG_INFO"] = "DEBUG_INFO";
})(PageName || (PageName = {}));

export let LogRequestType;

(function (LogRequestType) {
  LogRequestType["QUERY"] = "QUERY";
  LogRequestType["MUTATION"] = "MUTATION";
  LogRequestType["RAW"] = "RAW";
  LogRequestType["CHART"] = "CHART";
  LogRequestType["UNKNOWN"] = "UNKNOWN";
})(LogRequestType || (LogRequestType = {}));