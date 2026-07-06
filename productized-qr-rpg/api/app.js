const { handleApiRequest } = require("../server/api");

module.exports = async function appApi(req, res) {
  await handleApiRequest(req, res);
};
