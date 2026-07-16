const { AsyncLocalStorage } = require("async_hooks");

const requestStorage = new AsyncLocalStorage();

function runWithAction(action, callback) {
  return requestStorage.run({ action: String(action || "") }, callback);
}

function currentAction() {
  return requestStorage.getStore()?.action || "";
}

module.exports = {
  currentAction,
  runWithAction
};
