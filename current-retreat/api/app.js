const { runWithRequestContext } = require("../server/store");
const { handleApiRequest } = require("../server/api");

module.exports = async function appApi(req, res) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  const action = url.searchParams.get("action") || "";
  return runWithRequestContext({ action }, () => handleApiRequest(req, res));
};
