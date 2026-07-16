const { handleApiRequest } = require("../server/api");
const { runWithAction } = require("../server/request-context");

module.exports = async function appApi(req, res) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  const action = url.searchParams.get("action") || "";
  await runWithAction(action, () => handleApiRequest(req, res));
};
